import type { CostClass, FailureType } from './types';

/**
 * Execution-path fault injection.
 *
 * The first version of this wrapped a provider adapter, which quietly did nothing:
 * cloud workers run inside a RocketRide pipeline and never touch `adapter.invoke`,
 * so the wrapper sat on a code path the demo does not use. A fault injector has to
 * live where dispatch happens, not where one provider happens to be implemented.
 *
 * Everything this produces is labelled INJECTED in the event stream and in the
 * demo narration. The claim being demonstrated is that recovery works — not that a
 * provider happened to fail on cue.
 */

export interface Fault {
  failureType: FailureType;
  message: string;
  retryAfterMs?: number;
}

export interface FaultPlan {
  /** 1-based dispatch numbers to fail, counted across the whole mission. */
  failOnDispatch: number[];
  fault: Fault;
  /** Restrict to workers of this cost class. Omit to apply to any worker. */
  costClass?: CostClass;
}

export class FaultInjector {
  private dispatches = 0;

  constructor(private readonly plan: FaultPlan) {}

  /**
   * Called immediately before a worker is dispatched. Returns the fault to raise,
   * or null to proceed normally.
   */
  check(costClass: CostClass): Fault | null {
    if (this.plan.costClass && this.plan.costClass !== costClass) return null;

    this.dispatches += 1;
    if (!this.plan.failOnDispatch.includes(this.dispatches)) return null;

    return this.plan.fault;
  }

  get dispatchCount(): number {
    return this.dispatches;
  }
}

export const INJECTED_RATE_LIMIT: Fault = {
  failureType: 'RATE_LIMIT',
  message: 'INJECTED 429 rate limit (deterministic fault injection, not a real provider error)',
  retryAfterMs: 20_000,
};
