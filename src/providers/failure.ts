import type {
  ModelDescriptor,
  NormalizedModelRequest,
  NormalizedModelResponse,
  ProviderAdapter,
  ProviderFailure,
  ProviderHealth,
  UsageEstimate,
} from '../core/types';
import { ProviderHttpError, classifyHttpish } from './ollama';

/**
 * Deterministic failure injection.
 *
 * Why this exists: recovery is the product claim, and you cannot demonstrate
 * recovery by hoping a provider misbehaves on camera. This adapter wraps a real
 * provider and makes it fail on a schedule, so the cognitive handoff is reproducible
 * in tests and in the demo.
 *
 * It is honest by construction: anything it produces is labelled INJECTED in the
 * event stream, and the demo narration says so out loud. The innovation being shown
 * is the recovery, not the coincidence of a real outage.
 */

export type InjectedFault =
  | { kind: 'rate-limit'; retryAfterMs?: number }
  | { kind: 'timeout' }
  | { kind: 'server-error' }
  | { kind: 'context-limit' }
  | { kind: 'invalid-output' }
  | { kind: 'auth' };

export interface FailurePlan {
  /** Fail on these 1-based call numbers for this model. Others pass through. */
  failOnCalls: number[];
  fault: InjectedFault;
  /**
   * Restrict injection to one model. When omitted, calls are counted across the
   * whole provider instead of per model -- which is what you want for a demo,
   * because the fault then lands on whichever worker the auction actually hired
   * rather than on a model it may never pick.
   */
  targetModelKey?: string;
}

export class FailureInjectingAdapter implements ProviderAdapter {
  readonly providerId: string;
  readonly costClass;
  private callCounts = new Map<string, number>();

  constructor(
    private readonly inner: ProviderAdapter,
    private readonly plan: FailurePlan,
    private readonly onInject?: (modelKey: string, fault: InjectedFault) => void,
  ) {
    this.providerId = inner.providerId;
    this.costClass = inner.costClass;
  }

  discoverModels(): Promise<ModelDescriptor[]> {
    return this.inner.discoverModels();
  }

  health(): Promise<ProviderHealth> {
    return this.inner.health();
  }

  estimate(model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate {
    return this.inner.estimate(model, request);
  }

  async invoke(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse> {
    if (this.plan.targetModelKey && this.plan.targetModelKey !== model.key) {
      return this.inner.invoke(model, request, signal);
    }

    const counterKey = this.plan.targetModelKey ? model.key : '__provider__';
    const n = (this.callCounts.get(counterKey) ?? 0) + 1;
    this.callCounts.set(counterKey, n);

    if (!this.plan.failOnCalls.includes(n)) {
      return this.inner.invoke(model, request, signal);
    }

    this.onInject?.(model.key, this.plan.fault);

    switch (this.plan.fault.kind) {
      case 'rate-limit':
        throw new ProviderHttpError(
          429,
          `{"error":"rate_limit_exceeded","retry-after":${Math.round((this.plan.fault.retryAfterMs ?? 20000) / 1000)},"injected":true}`,
        );
      case 'auth':
        throw new ProviderHttpError(401, '{"error":"invalid_api_key","injected":true}');
      case 'server-error':
        throw new ProviderHttpError(503, '{"error":"service_unavailable","injected":true}');
      case 'context-limit':
        throw new ProviderHttpError(
          400,
          '{"error":"maximum context length exceeded","injected":true}',
        );
      case 'timeout': {
        const err = new Error('injected timeout');
        err.name = 'TimeoutError';
        throw err;
      }
      case 'invalid-output':
        // Returns successfully but with unparseable content, which exercises the
        // INVALID_OUTPUT branch rather than the transport branch.
        return {
          text: 'Sure! I finished the task successfully. Everything passes.',
          promptTokens: 100,
          completionTokens: 12,
          resolvedModel: model.modelId,
          durationMs: 400,
        };
    }
  }

  classifyError(error: unknown): ProviderFailure {
    return classifyHttpish(error);
  }
}
