import type { MissionSpec, MissionTask, TaskCategory, VerificationCheckSpec } from './types';
import { MissionEventLog } from './events';
import { BudgetGovernor } from './budget';
import type { MissionState } from './scheduler';

/**
 * Mission assembly.
 *
 * Small on purpose: creating a mission is bookkeeping, and keeping it separate from
 * the scheduler is what lets the invariant tests build a mission state without
 * standing up providers, executors or a database.
 */

export function createMissionState(spec: MissionSpec, tasks: MissionTask[]): MissionState {
  const startedAt = Date.now();
  const events = new MissionEventLog(spec.id, startedAt);

  events.emit('mission.created', `Mission created: ${spec.goal.slice(0, 160)}`, {
    data: {
      budgetUsd: spec.budget.maxUsd,
      budgetHard: spec.budget.hard,
      privacy: spec.privacy.mode,
      qualityTarget: spec.quality.target,
    },
  });
  events.emit('mission.compiled', `Compiled into ${tasks.length} tasks`, {
    data: {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, dependsOn: t.dependencies })),
    },
  });
  for (const task of tasks) {
    events.emit('task.created', `Task: ${task.title}`, {
      taskId: task.id,
      data: { category: task.category, dependencies: task.dependencies, fileScope: task.fileScope },
    });
  }

  return {
    spec,
    status: 'QUEUED',
    tasks,
    workers: [],
    checkpoints: [],
    proofs: [],
    auctions: [],
    events,
    budget: new BudgetGovernor(spec.budget),
    startedAt,
  };
}

/**
 * Default verification for a task, derived from its category and file scope.
 *
 * Every task gets at least one deterministic check. A task whose only evidence
 * would be a model saying "done" is a task that cannot be verified, and we would
 * rather assert file existence than report unearned confidence.
 */
export function defaultChecksFor(
  input: { category: TaskCategory; fileScope: string[] },
  opts: { testCommand?: string[]; testLabel?: string } = {},
): VerificationCheckSpec[] {
  const checks: VerificationCheckSpec[] = input.fileScope.map((p, i) => ({
    id: `exists-${i}`,
    label: `${p} exists`,
    kind: 'file-exists',
    path: p,
    weight: 1,
  }));

  if (opts.testCommand) {
    checks.push({
      id: 'suite',
      label: opts.testLabel ?? 'Test suite',
      kind: 'command',
      argv: opts.testCommand,
      weight: 4,
      timeoutMs: 120_000,
    });
  }

  return checks;
}

/** A serialisable snapshot for the API, the UI and the canonical run artefact. */
export function snapshotMission(state: MissionState) {
  const ledger = state.budget.snapshot();
  const elapsedMs = (state.completedAt ?? Date.now()) - state.startedAt;

  return {
    mission: {
      id: state.spec.id,
      goal: state.spec.goal,
      status: state.status,
      budget: state.spec.budget,
      quality: state.spec.quality,
      privacy: state.spec.privacy,
      startedAt: new Date(state.startedAt).toISOString(),
      completedAt: state.completedAt ? new Date(state.completedAt).toISOString() : undefined,
      elapsedMs,
    },
    tasks: state.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      state: t.state,
      dependencies: t.dependencies,
      attemptCount: t.attemptCount,
      workerRunId: t.workerRunId,
      checkpointId: t.checkpointId,
      fileScope: t.fileScope,
    })),
    workers: state.workers,
    checkpoints: state.checkpoints.map((c) => ({
      id: c.id,
      taskId: c.taskId,
      fromModelKey: c.fromModelKey,
      reason: c.reason,
      originalContextTokens: c.originalContextTokens,
      checkpointTokens: c.checkpointTokens,
      reductionPct:
        c.originalContextTokens > 0
          ? Math.round((1 - c.checkpointTokens / c.originalContextTokens) * 100)
          : 0,
      remainingWork: c.remainingWork,
    })),
    proofs: state.proofs,
    auctions: state.auctions,
    usage: {
      paidSpendUsd: ledger.settledUsd,
      budgetMaxUsd: ledger.maxUsd,
      budgetHard: ledger.hard,
      localCalls: ledger.localCalls,
      hostCalls: ledger.hostCalls,
      freeCalls: ledger.freeCalls,
      paidCalls: ledger.paidCalls,
      blockedPaidAttempts: ledger.blockedAttempts,
      estimatedFrontierEquivalentUsd: Number(ledger.estimatedFrontierEquivalentUsd.toFixed(4)),
    },
    events: state.events.all(),
  };
}

export type MissionSnapshot = ReturnType<typeof snapshotMission>;
