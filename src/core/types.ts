/**
 * Leverage core domain contracts.
 *
 * This module is deliberately dependency-free: no React, no database driver, no
 * network client. Everything the control plane reasons about is defined here so the
 * scheduler, auction and budget governor can be unit-tested without infrastructure.
 */

// ---------------------------------------------------------------------------
// Mission
// ---------------------------------------------------------------------------

export type PrivacyMode = 'local-only' | 'prefer-local' | 'cloud-allowed';

/** Cost classes that never touch the paid budget, whatever the mission allows. */
export const UNPAID_COST_CLASSES = ['local', 'host', 'free'] as const;
export type ParallelismMode = 'auto' | 'fixed';

export type MissionStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'PLANNING'
  | 'RUNNING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PAUSED'
  | 'AWAITING_APPROVAL';

export interface MissionBudget {
  /** Hard ceiling on *paid* inference, in USD. */
  maxUsd: number;
  /** When true the ceiling is enforced by the policy filter, not by advice. */
  hard: boolean;
}

export interface RepositoryRef {
  /** Absolute path to the working copy the mission operates on. */
  root: string;
  label: string;
}

export interface MissionSpec {
  id: string;
  workspaceId: string;
  createdBy: string;
  goal: string;
  repository?: RepositoryRef;
  constraints: string[];
  budget: MissionBudget;
  quality: { target: number };
  privacy: { mode: PrivacyMode };
  parallelism: { mode: ParallelismMode; maxWorkers?: number };
  deadlineAt?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export type TaskState =
  | 'PENDING'
  | 'READY'
  | 'HIRING'
  | 'RUNNING'
  | 'BLOCKED'
  | 'CHECKPOINTING'
  | 'HANDOFF'
  | 'VERIFYING'
  | 'PASSED'
  | 'FAILED'
  | 'CANCELLED';

/** Terminal states -- a task in one of these will never be scheduled again. */
export const TERMINAL_TASK_STATES: readonly TaskState[] = ['PASSED', 'FAILED', 'CANCELLED'];

export type TaskCategory =
  | 'architecture'
  | 'backend'
  | 'frontend'
  | 'tests'
  | 'security'
  | 'docs'
  | 'research'
  | 'integration'
  | 'verification';

export type Risk = 'low' | 'medium' | 'high' | 'critical';

export type Capability =
  | 'code'
  | 'reasoning'
  | 'tests'
  | 'frontend'
  | 'backend'
  | 'security'
  | 'docs'
  | 'long-context'
  | 'tools';

export interface CapabilityRequirement {
  capability: Capability;
  /** 0..1 -- how much this capability matters for the task. */
  weight: number;
}

export interface VerificationCheckSpec {
  id: string;
  label: string;
  kind: 'command' | 'file-exists' | 'file-contains';
  /** For kind==='command': argv array. Never a shell string -- see SECURITY.md. */
  argv?: string[];
  path?: string;
  contains?: string;
  /** Weight inside the automated-verification bucket of the quality score. */
  weight: number;
  timeoutMs?: number;
}

/** What the worker must produce and how we will decide whether it succeeded. */
export interface VerificationPolicy {
  /** Shell checks run against the mission repository after the patch applies. */
  checks: VerificationCheckSpec[];
  /** Human-readable acceptance criteria, each independently gradeable. */
  acceptance: string[];
}

export interface MissionTask {
  id: string;
  missionId: string;
  title: string;
  description: string;
  category: TaskCategory;
  dependencies: string[];
  requiredCapabilities: CapabilityRequirement[];
  risk: Risk;
  qualityTarget: number;
  budgetUsd: number;
  /** Files this task may create or modify. Enforced when the patch is applied. */
  fileScope: string[];
  /**
   * Files the worker must be able to read but must never write -- the tests it has
   * to satisfy, the interface it has to match. Without these a worker is guessing
   * the contract, which is a far more expensive failure than a missing file.
   */
  referenceFiles: string[];
  verification: VerificationPolicy;
  state: TaskState;
  workerRunId?: string;
  attemptCount: number;
  checkpointId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Providers / models
// ---------------------------------------------------------------------------

/**
 * Where a worker's compute comes from, and therefore what it costs.
 *
 * `host` is the interesting one: the model belongs to the MCP host the user is
 * already sitting in, reached through the MCP sampling channel. It costs no API
 * key and no Leverage-side money because the user's own subscription already paid
 * for it. It is not `free` -- a free route is someone else's quota, a host route is
 * the user's own seat -- and conflating them would make the usage panel lie.
 */
export type CostClass = 'local' | 'host' | 'free' | 'paid';

export type ProviderHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'AUTH_ERROR'
  | 'UNKNOWN';

export interface ProviderHealth {
  status: ProviderHealthStatus;
  checkedAt: string;
  detail?: string;
  retryAfterMs?: number;
}

export interface ModelDescriptor {
  /** Globally unique, of the form providerId + ':' + modelId. */
  key: string;
  providerId: string;
  modelId: string;
  displayName: string;
  costClass: CostClass;
  /** USD per 1M input / output tokens. Zero for local and free routes. */
  pricing: { inputPerMTok: number; outputPerMTok: number };
  contextTokens: number;
  capabilities: Capability[];
  supportsTools: boolean;
}

export type FailureType =
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'TIMEOUT'
  | 'CONNECTION'
  | 'PROVIDER_5XX'
  | 'CONTEXT_LIMIT'
  | 'INVALID_OUTPUT'
  | 'TOOL_FAILURE'
  | 'TEST_FAILURE'
  | 'LOGIC_FAILURE'
  | 'POLICY_BLOCK'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface ProviderFailure {
  type: FailureType;
  message: string;
  retryAfterMs?: number;
  /** True when retrying the *same* model could plausibly succeed. */
  retryable: boolean;
}

export interface NormalizedModelRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
  /** Abort budget for the whole call. */
  timeoutMs: number;
}

export interface NormalizedModelResponse {
  text: string;
  promptTokens?: number;
  completionTokens?: number;
  /** What the provider actually routed to, when it differs from the requested id. */
  resolvedModel?: string;
  durationMs: number;
}

export interface UsageEstimate {
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
}

export interface ProviderAdapter {
  readonly providerId: string;
  readonly costClass: CostClass;
  discoverModels(): Promise<ModelDescriptor[]>;
  health(): Promise<ProviderHealth>;
  estimate(model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate;
  invoke(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse>;
  classifyError(error: unknown): ProviderFailure;
}

// ---------------------------------------------------------------------------
// Auction
// ---------------------------------------------------------------------------

export interface CandidateScore {
  modelKey: string;
  displayName: string;
  providerId: string;
  costClass: CostClass;
  eligible: boolean;
  /** Populated only when `eligible` is false. */
  ineligibleReason?: string;
  utility: number;
  breakdown: {
    taskFit: number;
    reputation: number;
    contextFit: number;
    availability: number;
    speed: number;
    costPenalty: number;
    quotaRisk: number;
  };
  sampleCount: number;
  estimatedCostUsd: number;
}

export interface AuctionResult {
  taskId: string;
  candidates: CandidateScore[];
  winner?: CandidateScore;
  /** Human-readable justification shown in Mission Control. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Context compiler
// ---------------------------------------------------------------------------

export interface ContextFile {
  path: string;
  reason: string;
  content?: string;
  approxTokens: number;
}

export interface ContextBundle {
  taskSummary: string;
  constraints: string[];
  files: ContextFile[];
  dependencyResults: { taskId: string; title: string; summary: string }[];
  failures: { attempt: number; failureType: FailureType; detail: string }[];
  approximateTokens: number;
  /** Tokens the whole repository would have cost, for the reduction metric. */
  availableRepoTokens: number;
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

export interface ProofCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'skipped';
  detail: string;
  durationMs: number;
  weight: number;
}

export interface QualityScore {
  total: number;
  acceptance: number;
  automated: number;
  staticChecks: number;
  /** Present only when an AI reviewer actually ran. Never invented. */
  aiReview?: number;
  weights: Record<string, number>;
}

export interface ProofPack {
  id: string;
  missionId: string;
  taskId?: string;
  status: 'verified' | 'partial' | 'failed';
  worker?: { modelKey: string; providerId: string; displayName: string };
  filesChanged: string[];
  patchHash?: string;
  checks: ProofCheck[];
  unresolved: string[];
  qualityScore: QualityScore;
  metrics: {
    durationMs: number;
    promptTokens?: number;
    completionTokens?: number;
    actualCostUsd: number;
  };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Checkpoint / handoff
// ---------------------------------------------------------------------------

export interface CommandEvidence {
  argv: string[];
  exitCode: number;
  summary: string;
}

export interface CognitiveCheckpoint {
  id: string;
  missionId: string;
  taskId: string;
  fromWorkerRunId: string;
  fromModelKey: string;
  createdAt: string;
  reason: FailureType;
  goal: string;
  currentPlan: string[];
  relevantFiles: string[];
  filesChanged: string[];
  patchRef?: string;
  decisions: string[];
  assumptions: string[];
  successfulChecks: ProofCheck[];
  failedChecks: ProofCheck[];
  hypotheses: string[];
  blockers: string[];
  remainingWork: string[];
  /** Tokens the originating worker had consumed before it died. */
  originalContextTokens: number;
  /** Tokens this checkpoint costs to transfer. */
  checkpointTokens: number;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// Worker runs
// ---------------------------------------------------------------------------

export interface WorkerRun {
  id: string;
  missionId: string;
  taskId: string;
  modelKey: string;
  providerId: string;
  displayName: string;
  role: string;
  costClass: CostClass;
  status: 'running' | 'verifying' | 'passed' | 'failed' | 'released' | 'replaced';
  startedAt: string;
  finishedAt?: string;
  promptTokens?: number;
  completionTokens?: number;
  actualCostUsd: number;
  failureType?: FailureType;
  contextTokens?: number;
  resumedFromCheckpointId?: string;
  auctionRationale?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type MissionEventType =
  | 'mission.created'
  | 'mission.compiled'
  | 'mission.started'
  | 'task.created'
  | 'task.ready'
  | 'auction.started'
  | 'auction.candidate'
  | 'auction.completed'
  | 'worker.hired'
  | 'worker.started'
  | 'worker.progress'
  | 'worker.failed'
  | 'worker.released'
  | 'worker.replaced'
  | 'provider.rate_limit'
  | 'checkpoint.created'
  | 'handoff.started'
  | 'handoff.completed'
  | 'verification.started'
  | 'proof.check'
  | 'verification.failed'
  | 'verification.passed'
  | 'task.completed'
  | 'task.failed'
  | 'budget.blocked'
  | 'approval.requested'
  | 'approval.resolved'
  | 'mission.completed'
  | 'mission.failed'
  | 'mission.cancelled';

export interface MissionEvent {
  /** Monotonic per mission -- the SSE resume cursor. */
  seq: number;
  id: string;
  missionId: string;
  type: MissionEventType;
  at: string;
  /** Milliseconds since mission start, for the timeline. */
  elapsedMs: number;
  taskId?: string;
  workerRunId?: string;
  message: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Budget ledger
// ---------------------------------------------------------------------------

export interface BudgetLedger {
  maxUsd: number;
  hard: boolean;
  reservedUsd: number;
  settledUsd: number;
  freeCalls: number;
  paidCalls: number;
  localCalls: number;
  /** Calls served by the user's own MCP host seat. */
  hostCalls: number;
  /** What the same observed token workload would cost on the baseline model. */
  estimatedFrontierEquivalentUsd: number;
  blockedAttempts: number;
}

// ---------------------------------------------------------------------------
// Reputation
// ---------------------------------------------------------------------------

export interface ModelObservation {
  modelKey: string;
  providerId: string;
  category: TaskCategory;
  verified: boolean;
  qualityScore: number;
  durationMs: number;
  costUsd: number;
  promptTokens?: number;
  completionTokens?: number;
  failureType?: FailureType;
  handedOff: boolean;
  at: string;
}

export interface ModelReputation {
  modelKey: string;
  category: TaskCategory | 'all';
  samples: number;
  verifiedSuccesses: number;
  /** Shrunk toward the prior -- never a raw ratio on tiny samples. */
  successRate: number;
  medianLatencyMs: number;
  reworkCount: number;
  confidence: 'none' | 'low' | 'medium' | 'high';
}
