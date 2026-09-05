import type {
  AuctionResult,
  CandidateScore,
  Capability,
  MissionSpec,
  MissionTask,
  ModelDescriptor,
  ModelReputation,
  ProviderHealth,
  UsageEstimate,
} from './types';
import type { BudgetGovernor } from './budget';
import { checkEligibility } from './policy';

/**
 * The model job market.
 *
 * A task is a job posting. Every discovered model is a candidate. Candidates that
 * fail policy are struck out with a stated reason; the survivors are scored and the
 * highest utility is hired.
 *
 * The weights below are a defensible starting point, not a law of nature. They are
 * exported and injectable precisely so the benchmark can vary them and so the tests
 * can pin behaviour without depending on tuned magic numbers.
 */

export interface AuctionWeights {
  taskFit: number;
  reputation: number;
  contextFit: number;
  availability: number;
  speed: number;
  costPenalty: number;
  quotaRisk: number;
}

export const DEFAULT_WEIGHTS: AuctionWeights = {
  taskFit: 0.34,
  reputation: 0.26,
  contextFit: 0.12,
  availability: 0.12,
  speed: 0.06,
  costPenalty: 0.06,
  quotaRisk: 0.04,
};

export interface AuctionCandidateInput {
  model: ModelDescriptor;
  health: ProviderHealth;
  estimate: UsageEstimate;
  reputation?: ModelReputation;
  /** Median latency observed for this model, in ms. Undefined when never run. */
  observedLatencyMs?: number;
}

export interface AuctionInput {
  mission: MissionSpec;
  task: MissionTask;
  candidates: AuctionCandidateInput[];
  budget: BudgetGovernor;
  contextTokensNeeded: number;
  weights?: AuctionWeights;
  /** Models already tried and failed on this task — never re-hire them. */
  excludeModelKeys?: string[];
}

/**
 * How well the model's declared capabilities cover what the task asked for,
 * weighted by how much each capability matters. A model missing a heavily-weighted
 * capability is penalised hard; missing a nice-to-have barely registers.
 */
function scoreTaskFit(model: ModelDescriptor, task: MissionTask): number {
  const reqs = task.requiredCapabilities;
  if (reqs.length === 0) return 0.6;

  const have = new Set<Capability>(model.capabilities);
  let weighted = 0;
  let total = 0;
  for (const req of reqs) {
    total += req.weight;
    if (have.has(req.capability)) weighted += req.weight;
  }
  const coverage = total === 0 ? 0.6 : weighted / total;

  // Tool support is a hard practical advantage for anything that must edit files.
  const toolBonus = model.supportsTools && task.category !== 'docs' ? 0.05 : 0;
  return Math.min(1, coverage + toolBonus);
}

/**
 * Reputation with shrinkage.
 *
 * A model that went 1-for-1 is not a 100% model. We pull the observed rate toward a
 * neutral prior with a pseudo-count, so a model needs real evidence before it can
 * out-rank a well-established one. This is what stops the UI from ever claiming
 * "97.3%" off two runs.
 */
const PRIOR_MEAN = 0.62;
const PRIOR_STRENGTH = 4;

export function shrinkSuccessRate(successes: number, samples: number): number {
  return (successes + PRIOR_MEAN * PRIOR_STRENGTH) / (samples + PRIOR_STRENGTH);
}

export function confidenceFor(samples: number): ModelReputation['confidence'] {
  if (samples === 0) return 'none';
  if (samples < 5) return 'low';
  if (samples < 15) return 'medium';
  return 'high';
}

function scoreReputation(rep?: ModelReputation): number {
  if (!rep || rep.samples === 0) return PRIOR_MEAN;

  const shrunk = shrinkSuccessRate(rep.verifiedSuccesses, rep.samples);

  // Shrinkage alone is too forgiving at the bottom of the range. A model with
  // several observations and zero successes is not "somewhat below average" -- it
  // has demonstrated it cannot do this work, and the prior should stop protecting
  // it. Without this, a model that failed every probe still out-ranks a proven one
  // on a small latency advantage, which is exactly what happened on the first run.
  if (rep.verifiedSuccesses === 0 && rep.samples >= 2) {
    return shrunk * 0.25;
  }
  return shrunk;
}

/**
 * Headroom in the context window. A model that barely fits is risky — one retry with
 * added failure context and it overflows — so comfortable headroom scores higher
 * than a tight fit, and both beat not fitting (which policy already excluded).
 */
function scoreContextFit(model: ModelDescriptor, needed: number): number {
  if (model.contextTokens <= 0) return 0.3;
  const ratio = needed / model.contextTokens;
  if (ratio > 1) return 0;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 0.85;
  if (ratio < 0.75) return 0.6;
  return 0.35;
}

function scoreAvailability(health: ProviderHealth): number {
  switch (health.status) {
    case 'HEALTHY':
      return 1;
    case 'DEGRADED':
      return 0.55;
    case 'RATE_LIMITED':
      return 0.15;
    case 'UNKNOWN':
      return 0.5;
    default:
      return 0;
  }
}

function scoreSpeed(observedLatencyMs?: number): number {
  if (observedLatencyMs === undefined) return 0.5;
  // 2s -> ~1.0, 30s -> ~0.2. Diminishing penalty rather than a cliff.
  const seconds = observedLatencyMs / 1000;
  return Math.max(0.05, Math.min(1, 2 / Math.max(2, seconds)));
}

function scoreCostPenalty(model: ModelDescriptor, estimate: UsageEstimate): number {
  if (model.costClass === 'local') return 0;
  // The host seat costs Leverage nothing, but it is the user's own rate limit and
  // their interactive session -- a small penalty keeps it as the capable fallback
  // rather than the default that saturates their subscription.
  if (model.costClass === 'host') return 0.15;
  if (model.costClass === 'free') return 0.02; // free routes still cost quota
  // Paid: penalty grows with spend, saturating so an expensive model is not
  // infinitely bad — just clearly worse when a capable free option exists.
  return Math.min(1, estimate.estimatedCostUsd / 0.05);
}

function scoreQuotaRisk(model: ModelDescriptor, health: ProviderHealth): number {
  if (model.costClass === 'local') return 0;
  if (model.costClass === 'host') return 0.2;
  if (health.status === 'RATE_LIMITED') return 1;
  if (health.status === 'DEGRADED') return 0.5;
  return model.costClass === 'free' ? 0.25 : 0.1;
}

export function runAuction(input: AuctionInput): AuctionResult {
  const w = input.weights ?? DEFAULT_WEIGHTS;
  const excluded = new Set(input.excludeModelKeys ?? []);
  const scored: CandidateScore[] = [];

  for (const cand of input.candidates) {
    const { model, health, estimate, reputation, observedLatencyMs } = cand;

    if (excluded.has(model.key)) {
      scored.push(
        ineligible(model, estimate, reputation, 'Already attempted and failed on this task'),
      );
      continue;
    }

    const verdict = checkEligibility({
      mission: input.mission,
      task: input.task,
      model,
      health,
      estimate,
      budget: input.budget,
      contextTokensNeeded: input.contextTokensNeeded,
    });

    if (!verdict.eligible) {
      scored.push(ineligible(model, estimate, reputation, verdict.reason!));
      continue;
    }

    const breakdown = {
      taskFit: scoreTaskFit(model, input.task),
      reputation: scoreReputation(reputation),
      contextFit: scoreContextFit(model, input.contextTokensNeeded),
      availability: scoreAvailability(health),
      speed: scoreSpeed(observedLatencyMs),
      costPenalty: scoreCostPenalty(model, estimate),
      quotaRisk: scoreQuotaRisk(model, health),
    };

    const utility =
      breakdown.taskFit * w.taskFit +
      breakdown.reputation * w.reputation +
      breakdown.contextFit * w.contextFit +
      breakdown.availability * w.availability +
      breakdown.speed * w.speed -
      breakdown.costPenalty * w.costPenalty -
      breakdown.quotaRisk * w.quotaRisk;

    scored.push({
      modelKey: model.key,
      displayName: model.displayName,
      providerId: model.providerId,
      costClass: model.costClass,
      eligible: true,
      utility: Math.max(0, utility),
      breakdown,
      sampleCount: reputation?.samples ?? 0,
      estimatedCostUsd: estimate.estimatedCostUsd,
    });
  }

  // Eligible first, then by utility. Ineligible candidates stay in the list so the
  // UI can show *why* a strong model was not chosen — that is the point of the
  // "Claude API — INELIGIBLE — hard budget $0" line in the auction drawer.
  scored.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.utility - a.utility;
  });

  const winner = scored.find((c) => c.eligible);

  return {
    taskId: input.task.id,
    candidates: scored,
    winner,
    rationale: winner ? explain(winner, scored) : 'No eligible worker for this task',
  };
}

function ineligible(
  model: ModelDescriptor,
  estimate: UsageEstimate,
  reputation: ModelReputation | undefined,
  reason: string,
): CandidateScore {
  return {
    modelKey: model.key,
    displayName: model.displayName,
    providerId: model.providerId,
    costClass: model.costClass,
    eligible: false,
    ineligibleReason: reason,
    utility: 0,
    breakdown: {
      taskFit: 0,
      reputation: 0,
      contextFit: 0,
      availability: 0,
      speed: 0,
      costPenalty: 0,
      quotaRisk: 0,
    },
    sampleCount: reputation?.samples ?? 0,
    estimatedCostUsd: estimate.estimatedCostUsd,
  };
}

/** Plain-language justification. This is what Mission Control shows under HIRED. */
function explain(winner: CandidateScore, all: CandidateScore[]): string {
  const parts: string[] = [];
  parts.push(`${pct(winner.breakdown.taskFit)} task fit`);

  if (winner.sampleCount > 0) {
    parts.push(`${pct(winner.breakdown.reputation)} verified success over ${winner.sampleCount} prior job${winner.sampleCount === 1 ? '' : 's'}`);
  } else {
    parts.push('no prior jobs, scored on the neutral prior');
  }

  parts.push(
    winner.costClass === 'local'
      ? 'local runtime, no spend'
      : winner.costClass === 'host'
        ? 'your own host seat, no API key'
        : winner.costClass === 'free'
          ? 'free route, no spend'
          : `$${winner.estimatedCostUsd.toFixed(4)} estimated`,
  );

  const blocked = all.filter((c) => !c.eligible).length;
  if (blocked > 0) {
    parts.push(`${blocked} candidate${blocked === 1 ? '' : 's'} excluded by policy`);
  }

  return parts.join(' · ');
}

function pct(n: number): string {
  // "29% verified success", not "29 verified success", which reads as a count.
  return `${Math.round(n * 100)}%`;
}
