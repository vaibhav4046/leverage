import type {
  MissionSpec,
  ModelDescriptor,
  ProviderHealth,
  MissionTask,
  UsageEstimate,
} from './types';
import type { BudgetGovernor } from './budget';

/**
 * Hard eligibility filter.
 *
 * This runs BEFORE any scoring. A model that fails here is not a low-ranked
 * candidate — it is removed from the pool entirely and shown in the UI with the
 * reason it was excluded. That ordering is the whole point: if paid models were
 * merely penalised, a sufficiently good score could still buy its way past a $0
 * budget. Policy is not a weight.
 */

export interface EligibilityInput {
  mission: MissionSpec;
  task: MissionTask;
  model: ModelDescriptor;
  health: ProviderHealth;
  estimate: UsageEstimate;
  budget: BudgetGovernor;
  contextTokensNeeded: number;
}

export interface EligibilityVerdict {
  eligible: boolean;
  reason?: string;
}

export function checkEligibility(input: EligibilityInput): EligibilityVerdict {
  const { mission, model, health, estimate, budget, contextTokensNeeded } = input;

  // --- Money -------------------------------------------------------------
  // Checked first because it is the constraint users care most about being real.
  if (model.costClass === 'paid') {
    if (mission.budget.hard && mission.budget.maxUsd <= 0) {
      return {
        eligible: false,
        reason: `Zero-Dollar Mode: hard budget $0.00 blocks all paid routes`,
      };
    }
    if (!budget.canAfford(estimate.estimatedCostUsd)) {
      return {
        eligible: false,
        reason:
          `Estimated $${estimate.estimatedCostUsd.toFixed(4)} exceeds remaining ` +
          `budget $${budget.available().toFixed(4)}`,
      };
    }
  }

  // --- Privacy -----------------------------------------------------------
  const isLocal = model.costClass === 'local';
  if (mission.privacy.mode === 'local-only' && !isLocal) {
    return {
      eligible: false,
      reason:
        model.costClass === 'host'
          ? 'Privacy mode local-only: your host seat still sends content to its provider'
          : `Privacy mode local-only: ${model.providerId} is not a local runtime`,
    };
  }

  // --- Availability ------------------------------------------------------
  if (health.status === 'UNAVAILABLE') {
    return { eligible: false, reason: `Provider unavailable: ${health.detail ?? 'no response'}` };
  }
  if (health.status === 'AUTH_ERROR') {
    return { eligible: false, reason: `Provider credentials rejected` };
  }
  if (health.status === 'QUOTA_EXHAUSTED' as ProviderHealth['status']) {
    return { eligible: false, reason: `Provider quota exhausted` };
  }

  // --- Capacity ----------------------------------------------------------
  // A model that cannot physically hold the compiled context will fail with
  // CONTEXT_LIMIT after we have already paid for the attempt. Exclude it up front.
  if (contextTokensNeeded > model.contextTokens) {
    return {
      eligible: false,
      reason:
        `Context ${fmtTokens(contextTokensNeeded)} exceeds model window ` +
        `${fmtTokens(model.contextTokens)}`,
    };
  }

  return { eligible: true };
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

/**
 * Actions a worker may never take on its own, regardless of what the model decides
 * or what an instruction inside the repository tells it to do. Anything matching
 * raises an approval request instead of executing.
 */
export const APPROVAL_REQUIRED_ACTIONS = [
  'production-deploy',
  'destructive-migration',
  'secret-rotation',
  'irreversible-delete',
  'external-communication',
  'financial-action',
  'force-push',
  'disable-security-control',
] as const;

export type ApprovalAction = (typeof APPROVAL_REQUIRED_ACTIONS)[number];

/** Shell commands a worker's verification policy is permitted to invoke. */
export const ALLOWED_COMMANDS = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'tsc',
  'vitest',
  'eslint',
  'git',
]);

export function isCommandAllowed(argv: string[]): boolean {
  if (argv.length === 0) return false;
  const bin = argv[0].replace(/\.(cmd|exe|bat)$/i, '');
  return ALLOWED_COMMANDS.has(bin);
}
