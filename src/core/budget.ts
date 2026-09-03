import type { BudgetLedger, CostClass, MissionBudget } from './types';

/**
 * Budget governor.
 *
 * The single invariant this file exists to hold:
 *
 *     settledUsd + reservedUsd <= maxUsd,  whenever budget.hard
 *
 * It is enforced here, outside the model, with an atomic reserve/settle protocol —
 * not by asking an LLM to be careful. Zero-Dollar Mode is just `maxUsd === 0`
 * with `hard === true`, at which point `reserve()` refuses every paid call and the
 * policy filter (see policy.ts) removes paid models before they are even ranked.
 *
 * Reservation matters because workers run concurrently: without it, four workers
 * could each check "is there $0.05 left?" simultaneously and all four proceed.
 */

export class BudgetExceededError extends Error {
  constructor(
    readonly attemptedUsd: number,
    readonly ledger: BudgetLedger,
  ) {
    super(
      `Paid call of $${attemptedUsd.toFixed(6)} refused: would exceed hard budget ` +
        `$${ledger.maxUsd.toFixed(2)} (settled $${ledger.settledUsd.toFixed(6)}, ` +
        `reserved $${ledger.reservedUsd.toFixed(6)})`,
    );
    this.name = 'BudgetExceededError';
  }
}

export interface Reservation {
  id: string;
  amountUsd: number;
  costClass: CostClass;
}

/**
 * A mission's money.
 *
 * Single-process and synchronous on purpose: JavaScript's run-to-completion
 * semantics make `reserve` atomic with respect to other `reserve` calls, which is
 * exactly the guarantee the concurrency test asserts. A multi-process deployment
 * would move this behind the `budget_reservations` table with a transactional
 * check — the interface is deliberately shaped so that swap is local.
 */
export class BudgetGovernor {
  private ledger: BudgetLedger;
  private reservations = new Map<string, Reservation>();
  private nextId = 1;

  constructor(budget: MissionBudget) {
    this.ledger = {
      maxUsd: budget.maxUsd,
      hard: budget.hard,
      reservedUsd: 0,
      settledUsd: 0,
      freeCalls: 0,
      paidCalls: 0,
      localCalls: 0,
      hostCalls: 0,
      estimatedFrontierEquivalentUsd: 0,
      blockedAttempts: 0,
    };
  }

  snapshot(): BudgetLedger {
    return { ...this.ledger };
  }

  /** Headroom left for paid work right now. */
  available(): number {
    return this.ledger.maxUsd - this.ledger.settledUsd - this.ledger.reservedUsd;
  }

  /**
   * True when a paid call of this size could be admitted. Used by the policy filter
   * to mark paid candidates ineligible *before* they enter the ranking pool, so the
   * auction never shows a winner it would then have to refuse.
   */
  canAfford(amountUsd: number): boolean {
    if (amountUsd <= 0) return true;
    if (!this.ledger.hard) return true;
    return this.available() >= amountUsd;
  }

  /**
   * Claim headroom before a call is made.
   *
   * Local and free calls reserve nothing — they cannot consume the paid budget by
   * definition — but they are still counted so the usage panel is honest about the
   * shape of the workload.
   */
  reserve(amountUsd: number, costClass: CostClass): Reservation {
    if (costClass !== 'paid' || amountUsd <= 0) {
      return { id: `free-${this.nextId++}`, amountUsd: 0, costClass };
    }

    if (this.ledger.hard && this.available() < amountUsd) {
      this.ledger.blockedAttempts += 1;
      throw new BudgetExceededError(amountUsd, this.snapshot());
    }

    const reservation: Reservation = { id: `res-${this.nextId++}`, amountUsd, costClass };
    this.reservations.set(reservation.id, reservation);
    this.ledger.reservedUsd += amountUsd;
    return reservation;
  }

  /**
   * Convert a reservation into actual spend once the provider reports usage.
   *
   * `actualUsd` may exceed the reservation (a model produced more output than
   * estimated). We settle the true number — the ledger must reflect reality — but
   * an overshoot on a hard budget is recorded so it is visible rather than silent.
   */
  settle(reservation: Reservation, actualUsd: number, costClass: CostClass): void {
    if (this.reservations.has(reservation.id)) {
      this.reservations.delete(reservation.id);
      this.ledger.reservedUsd -= reservation.amountUsd;
      if (this.ledger.reservedUsd < 1e-12) this.ledger.reservedUsd = 0;
    }

    if (costClass === 'paid') {
      this.ledger.settledUsd += actualUsd;
      this.ledger.paidCalls += 1;
    } else if (costClass === 'local') {
      this.ledger.localCalls += 1;
    } else if (costClass === 'host') {
      // Real inference the user already paid for through their own subscription.
      // Counted, never charged.
      this.ledger.hostCalls += 1;
    } else {
      this.ledger.freeCalls += 1;
    }
  }

  /** Release a reservation for a call that never happened (aborted, cancelled). */
  release(reservation: Reservation): void {
    if (!this.reservations.has(reservation.id)) return;
    this.reservations.delete(reservation.id);
    this.ledger.reservedUsd -= reservation.amountUsd;
    if (this.ledger.reservedUsd < 1e-12) this.ledger.reservedUsd = 0;
  }

  /**
   * Record what this observed token workload would have cost on the baseline
   * frontier model.
   *
   * This is the only "savings" number Leverage reports and it is deliberately
   * narrow: it prices *the tokens that were actually consumed* at a published
   * rate. It is not a claim about what a human would have spent, and it is
   * labelled "estimated frontier-equivalent" everywhere it is displayed.
   * See BENCHMARKS.md for the rate and the argument for it.
   */
  recordFrontierEquivalent(
    promptTokens: number,
    completionTokens: number,
    baseline: { inputPerMTok: number; outputPerMTok: number },
  ): void {
    const cost =
      (promptTokens / 1_000_000) * baseline.inputPerMTok +
      (completionTokens / 1_000_000) * baseline.outputPerMTok;
    this.ledger.estimatedFrontierEquivalentUsd += cost;
  }

  /** Assertion used by the invariant test suite and by the mission completion path. */
  assertInvariant(): void {
    if (!this.ledger.hard) return;
    const committed = this.ledger.settledUsd + this.ledger.reservedUsd;
    // Allow float dust only.
    if (committed > this.ledger.maxUsd + 1e-9) {
      throw new Error(
        `Budget invariant violated: committed $${committed} > max $${this.ledger.maxUsd}`,
      );
    }
  }
}

/**
 * Published rate for the baseline model used in the frontier-equivalent estimate.
 * Kept in one place so BENCHMARKS.md and the UI cannot drift from the calculation.
 */
export const FRONTIER_BASELINE = {
  label: 'Claude Sonnet 4.5 published API pricing',
  inputPerMTok: 3.0,
  outputPerMTok: 15.0,
} as const;
