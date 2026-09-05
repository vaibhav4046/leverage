import type {
  Capability,
  ModelDescriptor,
  NormalizedModelRequest,
  NormalizedModelResponse,
  ProviderAdapter,
  ProviderFailure,
  ProviderHealth,
  UsageEstimate,
} from '../core/types';
import { estimateTokens } from '../core/tokens';

/**
 * Local Ollama runtime.
 *
 * Cost class `local`: these models can never consume the paid budget, so they stay
 * eligible under Zero-Dollar Mode and under `privacy: local-only` — the only
 * provider that survives that filter.
 */
export class OllamaAdapter implements ProviderAdapter {
  readonly providerId = 'ollama';
  readonly costClass = 'local' as const;

  constructor(private readonly baseUrl: string) {}

  async discoverModels(): Promise<ModelDescriptor[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`ollama /api/tags returned ${res.status}`);

    const body = (await res.json()) as {
      models?: {
        name: string;
        details?: { parameter_size?: string; context_length?: number };
        capabilities?: string[];
      }[];
    };

    return (body.models ?? [])
      // Embedding models cannot do worker jobs; excluding them here keeps them out
      // of the auction pool rather than relying on capability scoring to bury them.
      .filter((m) => !(m.capabilities ?? []).includes('embedding'))
      .map((m) => ({
        key: `ollama:${m.name}`,
        providerId: this.providerId,
        modelId: m.name,
        displayName: m.name.replace(/:latest$/, ''),
        costClass: this.costClass,
        pricing: { inputPerMTok: 0, outputPerMTok: 0 },
        contextTokens: m.details?.context_length ?? 8192,
        capabilities: inferCapabilities(m.name, m.capabilities ?? []),
        supportsTools: (m.capabilities ?? []).includes('tools'),
      }));
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      return res.ok
        ? { status: 'HEALTHY', checkedAt }
        : { status: 'DEGRADED', checkedAt, detail: `HTTP ${res.status}` };
    } catch (err) {
      return {
        status: 'UNAVAILABLE',
        checkedAt,
        detail: err instanceof Error ? err.message : 'unreachable',
      };
    }
  }

  estimate(_model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate {
    const promptTokens = estimateTokens(request.system) + estimateTokens(request.user);
    return {
      estimatedPromptTokens: promptTokens,
      estimatedCompletionTokens: request.maxOutputTokens,
      estimatedCostUsd: 0,
    };
  }

  // ponytail: one request in flight per runtime. Two models resident at once on a
  // 6 GB card is an out-of-memory failure, not parallelism; a per-model queue if
  // a bigger card ever wants it.
  private queue: Promise<unknown> = Promise.resolve();

  invoke(model: ModelDescriptor, request: NormalizedModelRequest, signal: AbortSignal): Promise<NormalizedModelResponse> {
    const turn = this.queue.then(() => this.invokeNow(model, request, signal));
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private async invokeNow(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse> {
    if (signal.aborted) throw new Error('cancelled before the local runtime was free');
    const started = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(request.timeoutMs)]),
      body: JSON.stringify({
        model: model.modelId,
        stream: false,
        options: { temperature: request.temperature, num_predict: request.maxOutputTokens },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    });

    if (!res.ok) {
      throw new ProviderHttpError(res.status, await safeText(res));
    }

    const body = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      text: body.message?.content ?? '',
      promptTokens: body.prompt_eval_count,
      completionTokens: body.eval_count,
      resolvedModel: model.modelId,
      durationMs: Date.now() - started,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return classifyHttpish(error);
  }
}

/**
 * Ollama does not report what a model is good at, so this maps the model family to
 * capabilities. It is a heuristic and it is the *prior*: once a model has real
 * observations, reputation dominates the auction score.
 */
function inferCapabilities(name: string, native: string[]): Capability[] {
  const caps = new Set<Capability>(['reasoning']);
  const n = name.toLowerCase();

  if (n.includes('coder') || n.includes('code') || n.includes('qwen') || n.includes('kodro')) {
    caps.add('code');
    caps.add('backend');
  }
  if (n.includes('qwen3') || n.includes('qwen3.5') || n.includes('llama')) {
    caps.add('code');
    caps.add('tests');
    caps.add('frontend');
  }
  if (n.includes('tutor') || n.includes('gemma')) caps.add('docs');
  if (native.includes('tools')) caps.add('tools');

  return [...caps];
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`provider returned HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = 'ProviderHttpError';
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/**
 * Map a transport or HTTP error onto the failure taxonomy.
 *
 * The classification drives recovery: RATE_LIMIT waits or hands off, AUTH marks the
 * provider unhealthy instead of retrying into a wall, CONTEXT_LIMIT means the model
 * physically cannot do this job and must be replaced rather than retried.
 */
export function classifyHttpish(error: unknown): ProviderFailure {
  if (error instanceof ProviderHttpError) {
    const { status, body } = error;
    if (status === 401 || status === 403) {
      return { type: 'AUTH', message: error.message, retryable: false };
    }
    if (status === 429) {
      const retryAfter = /retry[- ]after["\s:]*(\d+)/i.exec(body);
      return {
        type: 'RATE_LIMIT',
        message: error.message,
        retryAfterMs: retryAfter ? Number(retryAfter[1]) * 1000 : 15_000,
        retryable: true,
      };
    }
    if (status === 402) {
      return { type: 'QUOTA_EXHAUSTED', message: error.message, retryable: false };
    }
    if (/context length|too many tokens|maximum context/i.test(body)) {
      return { type: 'CONTEXT_LIMIT', message: error.message, retryable: false };
    }
    if (status >= 500) {
      return { type: 'PROVIDER_5XX', message: error.message, retryable: true };
    }
    return { type: 'UNKNOWN', message: error.message, retryable: false };
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || /timed? ?out/i.test(error.message)) {
      return { type: 'TIMEOUT', message: error.message, retryable: true };
    }
    if (error.name === 'AbortError' || /abort|cancel/i.test(error.message)) {
      return { type: 'CANCELLED', message: error.message, retryable: false };
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(error.message)) {
      return { type: 'CONNECTION', message: error.message, retryable: true };
    }
    return { type: 'UNKNOWN', message: error.message, retryable: false };
  }

  return { type: 'UNKNOWN', message: String(error), retryable: false };
}
