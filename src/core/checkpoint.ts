import { createHash } from 'node:crypto';
import type {
  CognitiveCheckpoint,
  ContextBundle,
  FailureType,
  MissionTask,
  ProofCheck,
  WorkerRun,
} from './types';
import { estimateTokens } from './tokens';

/**
 * Cognitive checkpoint.
 *
 * When a worker dies we keep its *understanding*, not its transcript. The
 * replacement resumes from a compact brief instead of re-deriving everything from
 * scratch — that is the difference between replacing a worker and restarting a
 * project.
 *
 * Bounded on purpose. Dumping the whole conversation would defeat the point: the
 * handoff has to be smaller than the history it replaces, or there is no saving to
 * report. Both figures are measured and travel with the checkpoint so the reduction
 * shown in Mission Control is arithmetic, not marketing.
 */

export interface BuildCheckpointArgs {
  task: MissionTask;
  worker: WorkerRun;
  bundle: ContextBundle;
  reason: FailureType;
  detail: string;
  /** Partial work the dying worker produced, if any survived. */
  filesChanged: string[];
  decisions: string[];
  assumptions: string[];
  remainingWork: string[];
  successfulChecks: ProofCheck[];
  failedChecks: ProofCheck[];
  patchRef?: string;
  confidence?: number;
}

const MAX_LIST_ITEMS = 8;
const MAX_ITEM_CHARS = 240;

export function buildCheckpoint(args: BuildCheckpointArgs): CognitiveCheckpoint {
  const { task, worker, bundle } = args;

  const hypotheses = deriveHypotheses(args.reason, args.detail, args.failedChecks);

  const checkpoint: CognitiveCheckpoint = {
    id: `cp_${createHash('sha256')
      .update(`${task.id}:${worker.id}:${Date.now()}`)
      .digest('hex')
      .slice(0, 12)}`,
    missionId: task.missionId,
    taskId: task.id,
    fromWorkerRunId: worker.id,
    fromModelKey: worker.modelKey,
    createdAt: new Date().toISOString(),
    reason: args.reason,
    goal: task.title,
    currentPlan: clampList(args.remainingWork.length ? args.remainingWork : [task.description]),
    // Paths only. The successor re-reads the files; shipping their contents would
    // make the handoff as expensive as the context it is meant to replace.
    relevantFiles: clampList(bundle.files.map((f) => f.path), 20),
    filesChanged: clampList(args.filesChanged, 20),
    patchRef: args.patchRef,
    decisions: clampList(args.decisions),
    assumptions: clampList(args.assumptions),
    successfulChecks: args.successfulChecks.slice(0, MAX_LIST_ITEMS),
    failedChecks: args.failedChecks.slice(0, MAX_LIST_ITEMS),
    hypotheses,
    blockers: clampList([`${args.reason}: ${args.detail}`]),
    remainingWork: clampList(args.remainingWork),
    originalContextTokens: bundle.approximateTokens,
    checkpointTokens: 0,
    confidence: args.confidence,
  };

  checkpoint.checkpointTokens = estimateTokens(renderCheckpoint(checkpoint));
  return checkpoint;
}

/**
 * The checkpoint as the successor sees it. Also the thing we measure, so the
 * reported handoff size is the real payload rather than a JSON blob nobody sends.
 */
export function renderCheckpoint(cp: CognitiveCheckpoint): string {
  const lines: string[] = [
    `You are resuming work abandoned by a previous worker (${cp.fromModelKey}).`,
    `It stopped because: ${cp.reason}.`,
    '',
    `GOAL: ${cp.goal}`,
  ];

  if (cp.currentPlan.length) {
    lines.push('', 'PLAN SO FAR:', ...cp.currentPlan.map((p) => `  - ${p}`));
  }
  if (cp.decisions.length) {
    lines.push('', 'DECISIONS ALREADY MADE (do not relitigate):', ...cp.decisions.map((d) => `  - ${d}`));
  }
  if (cp.assumptions.length) {
    lines.push('', 'ASSUMPTIONS:', ...cp.assumptions.map((a) => `  - ${a}`));
  }
  if (cp.filesChanged.length) {
    lines.push('', 'FILES ALREADY CHANGED:', ...cp.filesChanged.map((f) => `  - ${f}`));
  }
  if (cp.successfulChecks.length) {
    lines.push(
      '',
      'CHECKS ALREADY PASSING (do not break these):',
      ...cp.successfulChecks.map((c) => `  - ${c.label}`),
    );
  }
  if (cp.failedChecks.length) {
    lines.push('', 'CHECKS STILL FAILING:', ...cp.failedChecks.map((c) => `  - ${c.label}: ${c.detail}`));
  }
  if (cp.hypotheses.length) {
    lines.push('', 'WORKING HYPOTHESES:', ...cp.hypotheses.map((h) => `  - ${h}`));
  }
  if (cp.blockers.length) {
    lines.push('', 'WHY THE PREVIOUS WORKER STOPPED:', ...cp.blockers.map((b) => `  - ${b}`));
  }
  if (cp.remainingWork.length) {
    lines.push('', 'REMAINING WORK:', ...cp.remainingWork.map((r) => `  - ${r}`));
  }

  return lines.join('\n');
}

/** Context saved by handing over a brief instead of a transcript. */
export function contextReduction(cp: CognitiveCheckpoint): number {
  if (cp.originalContextTokens <= 0) return 0;
  const saved = 1 - cp.checkpointTokens / cp.originalContextTokens;
  return Math.max(0, Math.min(1, saved));
}

/**
 * Turn a failure into something actionable for the successor.
 *
 * The distinction that matters: an infrastructure failure says nothing about the
 * work, and telling the next worker "the approach was wrong" when the real cause
 * was a 429 would actively mislead it.
 */
function deriveHypotheses(reason: FailureType, detail: string, failed: ProofCheck[]): string[] {
  switch (reason) {
    case 'RATE_LIMIT':
    case 'QUOTA_EXHAUSTED':
      return [
        'The previous worker hit a provider limit, not a problem with the approach.',
        'Its partial reasoning is sound, continue rather than restarting.',
      ];
    case 'CONTEXT_LIMIT':
      return [
        'The previous worker could not hold the whole task in its context window.',
        'Work file by file and keep intermediate state short.',
      ];
    case 'TIMEOUT':
      return ['The previous worker was too slow. Prefer the smallest correct change.'];
    case 'INVALID_OUTPUT':
      return [
        'The previous worker produced unparseable output. Emit exactly one JSON object, no prose.',
      ];
    case 'TEST_FAILURE':
      return failed.length
        ? failed.slice(0, 3).map((c) => `Failing check "${c.label}": ${c.detail}`)
        : ['Verification failed. Read the failing check before changing anything.'];
    default:
      return [`Previous attempt ended with ${reason}: ${detail.slice(0, MAX_ITEM_CHARS)}`];
  }
}

function clampList(items: string[], max = MAX_LIST_ITEMS): string[] {
  return items
    .filter(Boolean)
    .slice(0, max)
    .map((s) => (s.length > MAX_ITEM_CHARS ? `${s.slice(0, MAX_ITEM_CHARS)}...` : s));
}
