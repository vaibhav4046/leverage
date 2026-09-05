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
import { ProviderHttpError, classifyHttpish } from './ollama';

/**
 * OpenAI-compatible free model pool (OmniRoute).
 *
 * Cost class `free`: no dollars, but real quota that can and does run out — which is
 * exactly what makes it the honest place to demonstrate the cognitive handoff. A
 * 429 here is a genuine event, not a stage effect.
 *
 * Two roles:
 *   - Discovery and health for the auction.
 *   - Direct invocation on the local execution path. On the RocketRide path this
 *     same endpoint is what the engine's `llm_openai_api` node calls, so the model
 *     the auction picked is the model that actually runs either way.
 */
export class PoolAdapter implements ProviderAdapter {
  readonly providerId = 'pool';
  readonly costClass = 'free' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string = 'sk-leverage-pool',
    /** Restrict the catalogue; the full pool is ~387 models, most irrelevant here. */
    private readonly allowlist: string[] = DEFAULT_POOL_MODELS,
  ) {}

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async discoverModels(): Promise<ModelDescriptor[]> {
    // The hosted pool is token-gated; the local router ignores the header.
    const res = await fetch(`${this.baseUrl}/models`, { headers: this.authHeaders(), signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new ProviderHttpError(res.status, await res.text().catch(() => ''));

    const body = (await res.json()) as {
      data?: { id: string; context_length?: number; capabilities?: { tool_calling?: boolean } }[];
    };
    const available = new Map((body.data ?? []).map((m) => [m.id, m]));

    return this.allowlist
      .filter((id) => available.has(id))
      .map((id) => {
        const m = available.get(id)!;
        const spec = POOL_MODEL_SPECS[id] ?? { caps: ['reasoning', 'code'] as Capability[] };
        return {
          key: `pool:${id}`,
          providerId: this.providerId,
          modelId: id,
          // `openrouter/google/gemma-4-31b-it:free` is an address, not a name.
          displayName: spec.label ?? id.split('/').pop()!.replace(/:free$/, ''),
          costClass: this.costClass,
          pricing: { inputPerMTok: 0, outputPerMTok: 0 },
          // The gateway advertises 10M for its routers, which is a routing artefact
          // rather than a real window. Clamp so context-fit scoring stays meaningful.
          contextTokens: Math.min(m.context_length ?? 128_000, 200_000),
          capabilities: spec.caps,
          supportsTools: m.capabilities?.tool_calling ?? true,
        };
      });
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${this.baseUrl}/models`, { headers: this.authHeaders(), signal: AbortSignal.timeout(20_000) });
      if (res.status === 429) {
        return { status: 'RATE_LIMITED', checkedAt, detail: 'gateway rate limited' };
      }
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
    return {
      estimatedPromptTokens: estimateTokens(request.system) + estimateTokens(request.user),
      estimatedCompletionTokens: request.maxOutputTokens,
      estimatedCostUsd: 0,
    };
  }

  async invoke(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse> {
    const started = Date.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(request.timeoutMs)]),
      body: JSON.stringify({
        model: model.modelId,
        // The gateway streams by default; a worker needs one complete document.
        stream: false,
        temperature: request.temperature,
        max_tokens: request.maxOutputTokens,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    });

    if (!res.ok) throw new ProviderHttpError(res.status, await res.text().catch(() => ''));

    const body = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string | null; reasoning_content?: string; reasoning?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    // A reasoning model that spends its whole budget thinking returns an empty
    // content and the answer, if any, in its reasoning field. Take that rather
    // than fail the worker on an empty string.
    const message = body.choices?.[0]?.message;
    return {
      text: message?.content || message?.reasoning_content || message?.reasoning || '',
      promptTokens: body.usage?.prompt_tokens,
      completionTokens: body.usage?.completion_tokens,
      // The router resolves an alias to a concrete model; record what actually ran
      // so reputation is attributed to the thing that did the work.
      resolvedModel: body.model,
      durationMs: Date.now() - started,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return classifyHttpish(error);
  }
}

interface PoolSpec {
  label?: string;
  caps: Capability[];
}

/**
 * Curated slice of the gateway catalogue.
 *
 * A 387-model auction is noise, not intelligence: most entries are duplicates or
 * near-identical routers. These are chosen to span the capability space so the
 * auction has genuinely different candidates to choose between.
 */
export const DEFAULT_POOL_MODELS = [
  'auto/best-coding',
  'auto/best-reasoning',
  'auto/best-fast',
  'auto/coding:free',
  'auto/best-free',
  'ghm/deepseek/deepseek-v3-0324',
  'ghm/meta/llama-3.3-70b-instruct',
  'ghm/mistral-ai/codestral-2501',
];

const POOL_MODEL_SPECS: Record<string, PoolSpec> = {
  'auto/best-coding': { label: 'Pool · best-coding', caps: ['code', 'backend', 'frontend', 'tools'] },
  'auto/best-reasoning': { label: 'Pool · best-reasoning', caps: ['reasoning', 'security', 'tools'] },
  'auto/best-fast': { label: 'Pool · best-fast', caps: ['code', 'docs'] },
  'auto/coding:free': { label: 'Pool · coding-free', caps: ['code', 'tests', 'backend'] },
  'auto/best-free': { label: 'Pool · best-free', caps: ['reasoning', 'code', 'tools'] },
  'ghm/deepseek/deepseek-v3-0324': {
    label: 'DeepSeek V3',
    caps: ['code', 'reasoning', 'backend', 'tests'],
  },
  'ghm/meta/llama-3.3-70b-instruct': {
    label: 'Llama 3.3 70B',
    caps: ['reasoning', 'docs', 'code'],
  },
  'ghm/mistral-ai/codestral-2501': {
    label: 'Codestral 2501',
    caps: ['code', 'frontend', 'tests', 'long-context'],
  },
  // Hosted pool: ids are prefixed with the upstream that serves them. Every id
  // here answered a real completion; demo/evidence/pool-sweep.json has the sweep.
  'openrouter/minimax/minimax-m3:free': { label: 'MiniMax M3 via OpenRouter', caps: ['code', 'backend', 'tests'] },
  'openrouter/minimax/minimax-m2.7:free': { label: 'MiniMax M2.7 via OpenRouter', caps: ['code', 'backend'] },
  'openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free': { label: 'Nemotron 3 Nano 30B via OpenRouter', caps: ['reasoning', 'code'] },
  'openrouter/nvidia/nemotron-3-super-120b-a12b:free': { label: 'Nemotron 3 Super 120B via OpenRouter', caps: ['reasoning', 'code', 'tools'] },
  'openrouter/nvidia/nemotron-3.5-lightning:free': { label: 'Nemotron 3.5 Lightning via OpenRouter', caps: ['code', 'docs'] },
  'openrouter/poolside/laguna-s-2.1:free': { label: 'Laguna S 2.1 via OpenRouter', caps: ['code', 'tests'] },
  'nvidia/minimaxai/minimax-m3': { label: 'MiniMax M3 via NVIDIA', caps: ['code', 'backend', 'tests'] },
  'nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': { label: 'Nemotron 3 Nano 30B via NVIDIA', caps: ['reasoning', 'code'] },
  'nvidia/nvidia/nemotron-3-super-120b-a12b': { label: 'Nemotron 3 Super 120B via NVIDIA', caps: ['reasoning', 'code', 'tools'] },
  'nvidia/nvidia/nemotron-3-ultra-550b-a55b': { label: 'Nemotron 3 Ultra 550B via NVIDIA', caps: ['reasoning', 'code', 'tools', 'long-context'] },
  'nvidia/nvidia/nemotron-3.5-lightning-30b-a3b': { label: 'Nemotron 3.5 Lightning via NVIDIA', caps: ['code', 'docs'] },
  'nvidia/openai/gpt-oss-20b': { label: 'GPT-OSS 20B via NVIDIA', caps: ['reasoning', 'code', 'tools'] },
  'nvidia/poolside/laguna-xs-2.1': { label: 'Laguna XS 2.1 via NVIDIA', caps: ['code', 'tests'] },
};
