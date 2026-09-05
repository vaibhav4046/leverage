import { describe, it, expect } from 'vitest';
import { BudgetGovernor, BudgetExceededError, FRONTIER_BASELINE } from '../src/core/budget';
import { validateDag, readyTasks, isBlocked, canTransition, isSettled, DagError } from '../src/core/dag';
import { runAuction } from '../src/core/auction';
import { checkEligibility, isCommandAllowed } from '../src/core/policy';
import { compileMissionSpec, parseTaskPlan, PlanRejectedError } from '../src/core/compiler';
import { buildCheckpoint, contextReduction, renderCheckpoint } from '../src/core/checkpoint';
import { ReputationStore } from '../src/core/reputation';
import { redactText, redactObject, MissionEventLog } from '../src/core/events';
import { parseWorkerOutput, InvalidWorkerOutputError } from '../src/core/worker-output';
import { computeQualityScore, runVerification } from '../src/core/verify';
import { createMissionState, snapshotMission } from '../src/core/mission';
import { MissionScheduler } from '../src/core/scheduler';
import type { ProviderRegistry } from '../src/providers/registry';
import type { RocketRideExecutor } from '../src/rocketride/executor';
import { safeJoin } from '../src/core/context';
import { FaultInjector, INJECTED_RATE_LIMIT } from '../src/core/faults';
import { requireWritable, AuthError, type Identity } from '../src/auth/policy';
import { FileMissionRepository } from '../src/db/memory';
import { isSafeWorkspaceId, isSafeMissionId } from '../src/db/types';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ContextBundle,
  MissionSpec,
  MissionTask,
  ModelDescriptor,
  ProviderHealth,
  VerificationCheckSpec,
  WorkerRun,
} from '../src/core/types';

/**
 * Orchestration invariants.
 *
 * These are the properties the product's claims rest on. If one of these fails,
 * something in the marketing copy has become a lie — so they are written as
 * assertions about behaviour, not about implementation detail.
 */

// --------------------------------------------------------------------- helpers

function mission(overrides: Partial<MissionSpec> = {}): MissionSpec {
  return {
    id: 'LVR-test',
    workspaceId: 'ws_a',
    createdBy: 'u1',
    goal: 'Finish the application and verify it',
    constraints: [],
    budget: { maxUsd: 0, hard: true },
    quality: { target: 0.95 },
    privacy: { mode: 'prefer-local' },
    parallelism: { mode: 'auto' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function task(id: string, deps: string[] = [], overrides: Partial<MissionTask> = {}): MissionTask {
  const now = new Date().toISOString();
  return {
    id,
    missionId: 'LVR-test',
    title: `Task ${id}`,
    description: 'do the thing',
    category: 'backend',
    dependencies: deps,
    requiredCapabilities: [{ capability: 'code', weight: 1 }],
    risk: 'medium',
    qualityTarget: 0.95,
    budgetUsd: 0,
    fileScope: [`src/${id}.js`],
    referenceFiles: [],
    verification: { checks: [], acceptance: [] },
    state: 'PENDING',
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function model(
  key: string,
  costClass: ModelDescriptor['costClass'],
  overrides: Partial<ModelDescriptor> = {},
): ModelDescriptor {
  return {
    key,
    providerId: key.split(':')[0],
    modelId: key.split(':')[1] ?? key,
    displayName: key,
    costClass,
    pricing: costClass === 'paid' ? { inputPerMTok: 3, outputPerMTok: 15 } : { inputPerMTok: 0, outputPerMTok: 0 },
    contextTokens: 128_000,
    capabilities: ['code', 'reasoning'],
    supportsTools: true,
    ...overrides,
  };
}

const HEALTHY: ProviderHealth = { status: 'HEALTHY', checkedAt: new Date().toISOString() };

/** One deterministic check, for plans that must get past the empty-gate refusal. */
const oneCheck = (): VerificationCheckSpec[] => [
  { id: 'exists-0', label: 'src/a.js exists', kind: 'file-exists', path: 'src/a.js', weight: 1 },
];

// ------------------------------------------------------------------ the budget

describe('budget governor: a hard budget is a wall, not a suggestion', () => {
  it('refuses any paid call under Zero-Dollar Mode', () => {
    const b = new BudgetGovernor({ maxUsd: 0, hard: true });
    expect(() => b.reserve(0.0001, 'paid')).toThrow(BudgetExceededError);
    expect(b.snapshot().blockedAttempts).toBe(1);
  });

  it('still allows local and free work at $0', () => {
    const b = new BudgetGovernor({ maxUsd: 0, hard: true });
    expect(() => b.reserve(0, 'local')).not.toThrow();
    expect(() => b.reserve(0, 'free')).not.toThrow();
  });

  it('cannot be overshot by concurrent reservations', () => {
    // Four workers each want $0.03 from a $0.10 budget. Three fit, the fourth
    // must be refused -- this is the race the reserve/settle protocol exists for.
    const b = new BudgetGovernor({ maxUsd: 0.1, hard: true });
    const held = [b.reserve(0.03, 'paid'), b.reserve(0.03, 'paid'), b.reserve(0.03, 'paid')];
    expect(held).toHaveLength(3);
    expect(() => b.reserve(0.03, 'paid')).toThrow(BudgetExceededError);
    b.assertInvariant();
  });

  it('releases headroom when a reserved call never happens', () => {
    const b = new BudgetGovernor({ maxUsd: 0.1, hard: true });
    const r = b.reserve(0.09, 'paid');
    expect(b.canAfford(0.05)).toBe(false);
    b.release(r);
    expect(b.canAfford(0.05)).toBe(true);
  });

  it('counts local, free and paid calls separately', () => {
    const b = new BudgetGovernor({ maxUsd: 1, hard: true });
    b.settle(b.reserve(0, 'local'), 0, 'local');
    b.settle(b.reserve(0, 'free'), 0, 'free');
    b.settle(b.reserve(0.01, 'paid'), 0.01, 'paid');
    const s = b.snapshot();
    expect(s).toMatchObject({ localCalls: 1, freeCalls: 1, paidCalls: 1 });
    expect(s.settledUsd).toBeCloseTo(0.01);
  });

  it('records a frontier-equivalent estimate without touching actual spend', () => {
    const b = new BudgetGovernor({ maxUsd: 0, hard: true });
    b.recordFrontierEquivalent(1_000_000, 100_000, FRONTIER_BASELINE);
    const s = b.snapshot();
    expect(s.settledUsd).toBe(0);
    expect(s.estimatedFrontierEquivalentUsd).toBeCloseTo(3 + 1.5, 5);
  });

  it('detects an overshoot at settle time, records the spend and refuses to hide it', () => {
    // Reservation is the preventive control; settle is the detective one. A
    // model that produced far more than estimated has already been paid for,
    // so the ledger must show the bill and the caller must be told at once,
    // not when assertInvariant runs at the end of the mission.
    const b = new BudgetGovernor({ maxUsd: 0.1, hard: true });
    const r = b.reserve(0.05, 'paid');
    expect(() => b.settle(r, 0.2, 'paid')).toThrow(BudgetExceededError);
    const s = b.snapshot();
    expect(s.settledUsd).toBeCloseTo(0.2);
    expect(s.reservedUsd).toBe(0);
    expect(s.paidCalls).toBe(1);
    expect(s.overshot).toBe(true);
    expect(() => b.assertInvariant()).toThrow(/invariant/);
  });

  it('accepts a bill above the reservation that still fits the budget', () => {
    const b = new BudgetGovernor({ maxUsd: 0.1, hard: true });
    const r = b.reserve(0.05, 'paid');
    expect(() => b.settle(r, 0.08, 'paid')).not.toThrow();
    expect(b.snapshot().overshot).toBe(false);
    b.assertInvariant();
  });
});

// --------------------------------------------------------------------- the DAG

describe('task graph: nothing runs before its dependencies pass', () => {
  it('rejects a cycle rather than deadlocking at runtime', () => {
    const tasks = [task('a', ['b']), task('b', ['a'])];
    expect(() => validateDag(tasks)).toThrow(DagError);
  });

  it('rejects a dependency on a task that does not exist', () => {
    expect(() => validateDag([task('a', ['ghost'])])).toThrow(DagError);
  });

  it('only reports a task ready once every dependency has PASSED', () => {
    const tasks = [
      task('a', [], { state: 'RUNNING' }),
      task('b', [], { state: 'PASSED' }),
      task('c', ['a', 'b']),
    ];
    expect(readyTasks(tasks).map((t) => t.id)).not.toContain('c');

    tasks[0].state = 'PASSED';
    expect(readyTasks(tasks).map((t) => t.id)).toContain('c');
  });

  it('treats a failed dependency as permanently blocking, not merely not-ready', () => {
    const tasks = [task('a', [], { state: 'FAILED' }), task('b', ['a'])];
    expect(readyTasks(tasks).map((t) => t.id)).not.toContain('b');
    expect(isBlocked(tasks[1], tasks)).toBe(true);
  });

  it('refuses illegal state transitions', () => {
    expect(canTransition('PENDING', 'PASSED')).toBe(false);
    expect(canTransition('VERIFYING', 'PASSED')).toBe(true);
    expect(canTransition('PASSED', 'RUNNING')).toBe(false);
  });
});

// ----------------------------------------------------------------- the auction

describe('job market: policy decides eligibility before score decides rank', () => {
  const base = {
    budget: new BudgetGovernor({ maxUsd: 0, hard: true }),
    contextTokensNeeded: 1000,
  };

  it('marks a paid model INELIGIBLE at $0 rather than out-ranking it', () => {
    const result = runAuction({
      mission: mission(),
      task: task('t'),
      candidates: [
        {
          model: model('paid:frontier', 'paid'),
          health: HEALTHY,
          estimate: { estimatedPromptTokens: 1000, estimatedCompletionTokens: 500, estimatedCostUsd: 0.02 },
        },
        {
          model: model('ollama:local', 'local'),
          health: HEALTHY,
          estimate: { estimatedPromptTokens: 1000, estimatedCompletionTokens: 500, estimatedCostUsd: 0 },
        },
      ],
      ...base,
    });

    const paid = result.candidates.find((c) => c.modelKey === 'paid:frontier')!;
    expect(paid.eligible).toBe(false);
    expect(paid.ineligibleReason).toMatch(/Zero-Dollar/i);
    expect(result.winner?.modelKey).toBe('ollama:local');
  });

  it('excludes every non-local model under local-only privacy', () => {
    const verdict = checkEligibility({
      mission: mission({ privacy: { mode: 'local-only' } }),
      task: task('t'),
      model: model('pool:free', 'free'),
      health: HEALTHY,
      estimate: { estimatedPromptTokens: 1, estimatedCompletionTokens: 1, estimatedCostUsd: 0 },
      budget: base.budget,
      contextTokensNeeded: 10,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/local-only/);
  });

  it('excludes a model whose context window cannot hold the task', () => {
    const verdict = checkEligibility({
      mission: mission(),
      task: task('t'),
      model: model('ollama:small', 'local', { contextTokens: 2048 }),
      health: HEALTHY,
      estimate: { estimatedPromptTokens: 1, estimatedCompletionTokens: 1, estimatedCostUsd: 0 },
      budget: base.budget,
      contextTokensNeeded: 50_000,
    });
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/exceeds model window/);
  });

  it('never re-hires a model already excluded for this task', () => {
    const result = runAuction({
      mission: mission(),
      task: task('t'),
      candidates: [
        {
          model: model('ollama:a', 'local'),
          health: HEALTHY,
          estimate: { estimatedPromptTokens: 1, estimatedCompletionTokens: 1, estimatedCostUsd: 0 },
        },
      ],
      excludeModelKeys: ['ollama:a'],
      ...base,
    });
    expect(result.winner).toBeUndefined();
  });

  it('ranks a model that has never succeeded below one that has', () => {
    const rep = new ReputationStore();
    const obs = (modelKey: string, verified: boolean) => ({
      modelKey,
      providerId: 'p',
      category: 'backend' as const,
      verified,
      qualityScore: verified ? 100 : 0,
      durationMs: 5000,
      costUsd: 0,
      handedOff: false,
      at: new Date().toISOString(),
    });
    for (let i = 0; i < 3; i += 1) {
      rep.record(obs('ollama:good', true));
      rep.record(obs('ollama:bad', false));
    }

    const result = runAuction({
      mission: mission(),
      task: task('t'),
      candidates: ['ollama:good', 'ollama:bad'].map((k) => ({
        model: model(k, 'local'),
        health: HEALTHY,
        estimate: { estimatedPromptTokens: 1, estimatedCompletionTokens: 1, estimatedCostUsd: 0 },
        reputation: rep.reputationFor(k, 'backend'),
        observedLatencyMs: 5000,
      })),
      ...base,
    });
    expect(result.winner?.modelKey).toBe('ollama:good');
  });
});

// -------------------------------------------------------------------- handoff

describe('cognitive handoff', () => {
  const bundle: ContextBundle = {
    taskSummary: 'Implement money helpers',
    constraints: ['Do not modify tests'],
    files: [{ path: 'src/money.js', reason: 'scope', content: 'x'.repeat(4000), approxTokens: 1100 }],
    dependencyResults: [],
    failures: [],
    approximateTokens: 1200,
    availableRepoTokens: 20_000,
  };

  const worker: WorkerRun = {
    id: 'wr_1',
    missionId: 'LVR-test',
    taskId: 'money',
    modelKey: 'pool:best-free',
    providerId: 'pool',
    displayName: 'Pool best-free',
    role: 'Backend Engineer',
    costClass: 'free',
    status: 'failed',
    startedAt: new Date().toISOString(),
    actualCostUsd: 0,
  };

  it('produces a checkpoint materially smaller than the context it replaces', () => {
    const cp = buildCheckpoint({
      task: task('money'),
      worker,
      bundle,
      reason: 'RATE_LIMIT',
      detail: 'quota exhausted',
      filesChanged: ['src/money.js'],
      decisions: ['Used integer cents throughout'],
      assumptions: ['Input is a decimal string'],
      remainingWork: ['allocate() remainder distribution'],
      successfulChecks: [],
      failedChecks: [],
    });

    expect(cp.checkpointTokens).toBeGreaterThan(0);
    expect(cp.checkpointTokens).toBeLessThan(cp.originalContextTokens);
    expect(contextReduction(cp)).toBeGreaterThan(0.3);
  });

  it('tells the successor a rate limit was not a problem with the approach', () => {
    const cp = buildCheckpoint({
      task: task('money'),
      worker,
      bundle,
      reason: 'RATE_LIMIT',
      detail: 'quota exhausted',
      filesChanged: [],
      decisions: [],
      assumptions: [],
      remainingWork: [],
      successfulChecks: [],
      failedChecks: [],
    });
    expect(cp.hypotheses.join(' ')).toMatch(/not.*problem with the approach/i);
    expect(renderCheckpoint(cp)).toContain('GOAL:');
  });

  it('never grows without bound, however much the worker produced', () => {
    const cp = buildCheckpoint({
      task: task('money'),
      worker,
      bundle,
      reason: 'TEST_FAILURE',
      detail: 'x'.repeat(5000),
      filesChanged: Array.from({ length: 100 }, (_, i) => `src/f${i}.js`),
      decisions: Array.from({ length: 100 }, (_, i) => `decision ${i}`),
      assumptions: [],
      remainingWork: [],
      successfulChecks: [],
      failedChecks: [],
    });
    expect(cp.decisions.length).toBeLessThanOrEqual(8);
    expect(cp.filesChanged.length).toBeLessThanOrEqual(20);
  });

  it('surfaces what a checkpoint carried in the mission snapshot, not just its size', () => {
    // The UI reads the snapshot. A checkpoint that arrives there as token counts
    // and nothing else looks empty, and a handoff that looks empty is not evidence.
    const state = createMissionState(mission(), [task('money')]);
    state.checkpoints.push(
      buildCheckpoint({
        task: task('money'),
        worker,
        bundle,
        reason: 'RATE_LIMIT',
        detail: 'quota exhausted',
        filesChanged: ['src/money.js'],
        decisions: ['Used integer cents throughout'],
        assumptions: ['Input is a decimal string'],
        remainingWork: ['allocate() remainder distribution'],
        successfulChecks: [],
        failedChecks: [],
      }),
    );
    const snap = snapshotMission(state);
    expect(snap.checkpoints[0].decisions).toContain('Used integer cents throughout');
    expect(snap.checkpoints[0].assumptions).toContain('Input is a decimal string');
    expect(snap.checkpoints[0].filesChanged).toEqual(['src/money.js']);
  });
});

// ------------------------------------------------------------------- security

describe('security boundaries', () => {
  it('refuses a path that escapes the repository', () => {
    expect(safeJoin('/repo', '../etc/passwd')).toBeNull();
    expect(safeJoin('/repo', '/etc/passwd')).toBeNull();
    expect(safeJoin('/repo', 'src/ok.js')).not.toBeNull();
  });

  it('only allows commands on the verification allowlist', () => {
    expect(isCommandAllowed(['node', '--test'])).toBe(true);
    expect(isCommandAllowed(['curl', 'http://evil'])).toBe(false);
    expect(isCommandAllowed(['rm', '-rf', '/'])).toBe(false);
    expect(isCommandAllowed([])).toBe(false);
  });

  it('redacts credential-shaped values from free text', () => {
    expect(redactText('key is rr_0000000000000000deadbeefcafe1234 here')).toContain('[redacted]');
    expect(redactText('sk-abcdefghijklmnopqrstuvwxyz012345')).toContain('[redacted]');
    expect(redactText('tk_060b9cdcadfed3c61c9bba0d35052e75')).toContain('[redacted]');
  });

  it('redacts by key name as well as by value shape', () => {
    const out = redactObject({ apiKey: 'anything at all', nested: { authorization: 'Bearer x' } }) as {
      apiKey: string;
      nested: { authorization: string };
    };
    expect(out.apiKey).toBe('[redacted]');
    expect(out.nested.authorization).toBe('[redacted]');
  });

  it('does not redact a token count because its key contains "token"', () => {
    // A recorded run lost 33 numeric fields to a substring match on "token".
    // A credential is a `token`; a count is `tokens`.
    const counts = {
      contextTokens: 453,
      checkpointTokens: 120,
      engineTokens: 9,
      maxTokens: 8000,
      modelKey: 'pool:best-free',
    };
    expect(redactObject(counts)).toEqual(counts);
  });

  it('redacts a credential-named key in any casing convention', () => {
    const out = redactObject({
      apiKey: 'a',
      api_key: 'b',
      authorization: 'c',
      accessToken: 'd',
      refreshToken: 'e',
      'X-Auth-Token': 'f',
      clientSecret: 'g',
    });
    expect(Object.values(out)).toEqual(Array(7).fill('[redacted]'));
  });

  it('redacts a credential-shaped value whatever its key is called', () => {
    const out = redactObject({
      contextNote: 'see sk-abcdefghijklmnopqrstuvwxyz012345',
      items: ['rr_0000000000000000deadbeefcafe1234'],
    });
    expect(out.contextNote).toBe('see [redacted]');
    expect(out.items[0]).toBe('[redacted]');
  });

  it('keeps secrets out of the mission event log', () => {
    const log = new MissionEventLog('LVR-test');
    log.emit('worker.hired', 'using rr_0000000000000000deadbeefcafe1234', {
      data: { apikey: 'rr_0000000000000000deadbeefcafe1234' },
    });
    const serialised = JSON.stringify(log.all());
    expect(serialised).not.toContain('deadbeefcafe1234');
  });
});

// -------------------------------------------------------------- mission compile

describe('mission compiler', () => {
  it('treats a zero budget as hard, always', () => {
    const spec = compileMissionSpec({
      goal: 'Finish the app. Budget: $0.',
      workspaceId: 'ws',
      createdBy: 'u',
    });
    expect(spec.budget).toEqual({ maxUsd: 0, hard: true });
  });

  it('defaults to $0 when no budget is stated', () => {
    const spec = compileMissionSpec({
      goal: 'Please finish this application properly',
      workspaceId: 'ws',
      createdBy: 'u',
    });
    expect(spec.budget.maxUsd).toBe(0);
    expect(spec.budget.hard).toBe(true);
  });

  it('carries imperative constraints through to workers', () => {
    const spec = compileMissionSpec({
      goal: 'Finish the app. Do not modify any file under test/.',
      workspaceId: 'ws',
      createdBy: 'u',
    });
    expect(spec.constraints.join(' ')).toMatch(/do not modify/i);
  });

  it('rejects a planner plan containing a cycle', () => {
    const spec = mission();
    const raw = JSON.stringify({
      tasks: [
        { id: 'a', title: 'A', dependencies: ['b'], fileScope: ['src/a.js'] },
        { id: 'b', title: 'B', dependencies: ['a'], fileScope: ['src/b.js'] },
      ],
    });
    expect(() => parseTaskPlan(raw, spec, oneCheck)).toThrow(DagError);
  });

  it('strips a planner file scope that escapes the repository', () => {
    const spec = mission();
    const raw = JSON.stringify({
      tasks: [{ id: 'a', title: 'A', dependencies: [], fileScope: ['../../etc/passwd', 'src/a.js'] }],
    });
    const tasks = parseTaskPlan(raw, spec, oneCheck);
    expect(tasks[0].fileScope).toEqual(['src/a.js']);
  });

  it('rejects a planner task that has no verification checks', () => {
    // A task nothing can prove done would otherwise reach the gate with an
    // empty list and, before the fix, pass on it.
    const raw = JSON.stringify({ tasks: [{ id: 'a', title: 'A', dependencies: [] }] });
    expect(() => parseTaskPlan(raw, mission(), () => [])).toThrow(PlanRejectedError);
    expect(() => parseTaskPlan(raw, mission(), () => [])).toThrow(/no verification checks/);
  });

  it('rejects planner output that is not JSON at all', () => {
    expect(() => parseTaskPlan('I think we should start by...', mission(), () => [])).toThrow(
      PlanRejectedError,
    );
  });
});

// -------------------------------------------------------------- worker output

describe('worker output protocol', () => {
  it('parses the fenced FILE format', () => {
    const out = parseWorkerOutput(
      'Sure!\n\n### FILE: src/money.js\n```js\nexport const a = `template`;\n```\n\n### NOTES\ndecisions: used cents\n',
    );
    expect(out.files).toHaveLength(1);
    expect(out.files[0].path).toBe('src/money.js');
    // The exact failure that broke the JSON contract: a backtick in the source.
    expect(out.files[0].content).toContain('`template`');
    expect(out.decisions).toContain('used cents');
  });

  it('still accepts a well-formed JSON answer', () => {
    const out = parseWorkerOutput(
      JSON.stringify({ files: [{ path: 'src/a.js', content: 'export const a = 1;' }] }),
    );
    expect(out.files[0].path).toBe('src/a.js');
  });

  it('repairs a JSON answer that used a template literal for the content', () => {
    const out = parseWorkerOutput('{"files":[{"path":"src/a.js","content":`line1\nline2`}]}');
    expect(out.files[0].content).toContain('line1');
  });

  it('throws rather than inventing a file when nothing is parseable', () => {
    expect(() => parseWorkerOutput('I have completed the task successfully.')).toThrow(
      InvalidWorkerOutputError,
    );
  });
});

// ------------------------------------------------------------------- quality

describe('quality score', () => {
  it('is driven by deterministic checks, not by model confidence', () => {
    const failing = computeQualityScore({
      acceptanceMet: 1,
      acceptanceTotal: 1,
      checks: [{ id: 'c', label: 'tests', status: 'fail', detail: '', durationMs: 1, weight: 4 }],
      staticChecks: [],
    });
    expect(failing.total).toBeLessThan(70);
    expect(failing.aiReview).toBeUndefined();
  });

  it('renormalises when no AI reviewer ran, instead of silently deflating', () => {
    const s = computeQualityScore({
      acceptanceMet: 1,
      acceptanceTotal: 1,
      checks: [{ id: 'c', label: 'tests', status: 'pass', detail: '', durationMs: 1, weight: 4 }],
      staticChecks: [],
    });
    expect(s.total).toBe(100);
  });
});

// ---------------------------------------------------------- verification gate

describe('verification gate: an empty gate is a failed gate', () => {
  it('fails a task with no checks instead of passing it vacuously', async () => {
    // Zero checks means zero evidence. `checks.every(...)` on an empty list is
    // true, which is exactly how nothing became proof of something.
    const result = await runVerification(task('t'), '/repo');
    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].status).toBe('fail');
    expect(result.checks[0].detail).toMatch(/no verification was defined/);
  });
});

// ------------------------------------------------------------------- reputation

describe('reputation', () => {
  it('never reports a confident rate from a single observation', () => {
    const store = new ReputationStore();
    store.record({
      modelKey: 'ollama:x',
      providerId: 'ollama',
      category: 'backend',
      verified: true,
      qualityScore: 100,
      durationMs: 1000,
      costUsd: 0,
      handedOff: false,
      at: new Date().toISOString(),
    });
    const rep = store.reputationFor('ollama:x')!;
    expect(rep.samples).toBe(1);
    expect(rep.confidence).toBe('low');
    // 1-for-1 must not read as 100%.
    expect(rep.successRate).toBeLessThan(0.85);
  });

  it('returns nothing at all for a model never observed', () => {
    expect(new ReputationStore().reputationFor('ollama:unknown')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------- faults

describe('fault injection', () => {
  it('fires on exactly the nominated dispatch and no other', () => {
    const injector = new FaultInjector({ failOnDispatch: [2], fault: INJECTED_RATE_LIMIT });
    expect(injector.check('free')).toBeNull();
    expect(injector.check('free')?.failureType).toBe('RATE_LIMIT');
    expect(injector.check('free')).toBeNull();
  });

  it('labels itself as injected so nothing downstream can present it as real', () => {
    expect(INJECTED_RATE_LIMIT.message).toMatch(/INJECTED/);
  });
});

// ------------------------------------------------------------------- identity

describe('read-only identity', () => {
  const readOnly: Identity = {
    userId: 'public-demo',
    workspaceId: 'ws_demo',
    displayName: 'Public demo',
    verified: false,
    readOnly: true,
  };

  it('refuses a mutation from a read-only identity', () => {
    // The public demo exists so a deployed instance can be explored. An identity
    // that could still POST would let a stranger spend the owner's inference
    // budget, which is the whole reason the flag is read-only rather than just
    // unverified.
    expect(() => requireWritable(readOnly)).toThrow(AuthError);
    try {
      requireWritable(readOnly);
    } catch (err) {
      expect((err as AuthError).status).toBe(403);
    }
  });

  it('permits a mutation from a writable identity', () => {
    expect(() => requireWritable({ ...readOnly, readOnly: false })).not.toThrow();
  });
});

// ----------------------------------------------------------------- repository

describe('mission repository', () => {
  const snapshot = (id: string, startedAt: string) =>
    ({
      mission: { id, goal: 'g', status: 'COMPLETED', startedAt },
      tasks: [],
      workers: [],
      checkpoints: [],
      proofs: [],
      auctions: [],
      usage: {},
      events: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  async function repo() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvr-repo-'));
    return new FileMissionRepository(dir);
  }

  it('round-trips a snapshot within its workspace', async () => {
    const r = await repo();
    await r.save('ws_a', snapshot('LVR-aaa', '2026-01-01T00:00:00.000Z'));
    expect((await r.get('ws_a', 'LVR-aaa'))?.mission.id).toBe('LVR-aaa');
  });

  it('never returns another workspace mission, even with the right id', async () => {
    // The snapshot carries no workspace id, so this is the check that stops a
    // mission id being an enumeration oracle across tenants.
    const r = await repo();
    await r.save('ws_a', snapshot('LVR-aaa', '2026-01-01T00:00:00.000Z'));
    expect(await r.get('ws_b', 'LVR-aaa')).toBeNull();
    expect(await r.list('ws_b')).toEqual([]);
  });

  it('refuses ids that could escape their directory', async () => {
    const r = await repo();
    expect(await r.get('../../etc', 'LVR-aaa')).toBeNull();
    expect(await r.get('ws_a', '../../../etc/passwd')).toBeNull();
    expect(isSafeWorkspaceId('../etc')).toBe(false);
    expect(isSafeMissionId('../../x')).toBe(false);
    expect(isSafeMissionId('LVR-f8f72d56')).toBe(true);
  });

  it('lists newest first', async () => {
    const r = await repo();
    await r.save('ws_a', snapshot('LVR-old', '2026-01-01T00:00:00.000Z'));
    await r.save('ws_a', snapshot('LVR-new', '2026-06-01T00:00:00.000Z'));
    expect((await r.list('ws_a')).map((m) => m.mission.id)).toEqual(['LVR-new', 'LVR-old']);
  });

  it('survives a corrupt file instead of losing the whole workspace', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lvr-repo-'));
    const r = new FileMissionRepository(dir);
    await r.save('ws_a', snapshot('LVR-good', '2026-01-01T00:00:00.000Z'));
    await fs.writeFile(path.join(dir, 'ws_a', 'LVR-bad.json'), '{ not json');
    expect((await r.list('ws_a')).map((m) => m.mission.id)).toEqual(['LVR-good']);
  });
});

// ------------------------------------------------------------------ approval

describe('human approval gate', () => {
  it('AWAITING_APPROVAL is a legal task state with legal transitions', () => {
    // A high-risk task must be able to stop. Without the state and the
    // transitions, assertTransition throws and the gate cannot exist.
    expect(canTransition('READY', 'AWAITING_APPROVAL')).toBe(true);
    expect(canTransition('AWAITING_APPROVAL', 'HIRING')).toBe(true);
    expect(canTransition('AWAITING_APPROVAL', 'CANCELLED')).toBe(true);
    // It must not be able to skip straight to done.
    expect(canTransition('AWAITING_APPROVAL', 'PASSED')).toBe(false);
  });

  it('a task awaiting approval is not settled, so the mission is not finished', () => {
    // The subtle one. With the gated task excluded from the claimable set, a
    // scheduler that only asks "is anything claimable" would end the mission and
    // silently drop the task instead of pausing for the human.
    const tasks = [
      { id: 'a', state: 'AWAITING_APPROVAL', dependencies: [] },
      { id: 'b', state: 'PASSED', dependencies: [] },
    ] as unknown as Parameters<typeof isSettled>[0];
    expect(isSettled(tasks)).toBe(false);
  });

  it('a gated task does not block an independent branch', () => {
    // Approval pauses one branch, not the mission. readyTasks is per-task, so a
    // sibling with satisfied dependencies must still be offered.
    const tasks = [
      { id: 'risky', state: 'AWAITING_APPROVAL', dependencies: [] },
      { id: 'safe', state: 'READY', dependencies: [] },
      { id: 'downstream', state: 'PENDING', dependencies: ['risky'] },
    ] as unknown as Parameters<typeof readyTasks>[0];
    const ready = readyTasks(tasks).map((t) => t.id);
    expect(ready).toContain('safe');
    // The gated task itself is not runnable, and neither is what depends on it.
    expect(ready).not.toContain('risky');
    expect(ready).not.toContain('downstream');
  });
});

describe('approval resolution', () => {
  const gated = () =>
    ({
      id: 'deploy',
      title: 'Deploy to production',
      risk: 'critical',
      state: 'AWAITING_APPROVAL',
      dependencies: [],
      updatedAt: '',
    }) as unknown as Parameters<typeof isSettled>[0][number];

  it('a rejected approval fails the task rather than running it', () => {
    expect(canTransition('AWAITING_APPROVAL', 'FAILED')).toBe(true);
  });

  it('a read-only identity cannot approve', () => {
    // The gate is only as good as the thing that stops the public demo resolving
    // it. requireWritable is what every mutating route calls first.
    const readOnly = {
      userId: 'demo',
      workspaceId: 'ws_demo',
      displayName: 'Public demo',
      verified: false,
      readOnly: true,
    } as Identity;
    expect(() => requireWritable(readOnly)).toThrow(AuthError);

    const operator = { ...readOnly, readOnly: false } as Identity;
    expect(() => requireWritable(operator)).not.toThrow();
  });

  it('an approved task returns to READY, not straight to PASSED', () => {
    // Approval is permission to run, not a result. A gate that could mark work
    // done would be worse than no gate.
    expect(canTransition('AWAITING_APPROVAL', 'READY')).toBe(true);
    expect(canTransition('AWAITING_APPROVAL', 'PASSED')).toBe(false);
    void gated;
  });
});

// ------------------------------------------------------------------ scheduler

describe('scheduler: an empty gate fails and a blown budget stops the hiring', () => {
  const OUTPUT = '### FILE: src/t.js\n```\nexport const a = 1;\n```\n';

  /** One model, one adapter, direct invocation. No providers, no network. */
  function stubScheduler(input: {
    spec?: Partial<MissionSpec>;
    model: ModelDescriptor;
    estimateUsd: number;
    response: { promptTokens?: number; completionTokens?: number };
  }) {
    const adapter = {
      estimate: () => ({
        estimatedPromptTokens: 100,
        estimatedCompletionTokens: 100,
        estimatedCostUsd: input.estimateUsd,
      }),
      invoke: async () => ({ text: OUTPUT, durationMs: 1, ...input.response }),
      classifyError: (err: unknown) => ({
        type: 'UNKNOWN' as const,
        message: String(err),
        retryable: false,
      }),
    };
    const registry = {
      sweep: async () => {},
      allModels: () => [input.model],
      adapterFor: () => adapter,
      healthFor: () => HEALTHY,
    } as unknown as ProviderRegistry;
    const state = createMissionState(mission(input.spec), [task('t')]);
    const scheduler = new MissionScheduler(
      state,
      { registry, executor: {} as RocketRideExecutor, reputation: new ReputationStore() },
      { useRocketRide: false, maxAttemptsPerTask: 1, maxConcurrency: 1 },
    );
    return { state, scheduler };
  }

  it('fails a task it cannot verify instead of passing it on an empty gate', async () => {
    // The test mission has no repository root, so no check could run. Before
    // the fix this path returned passed: true and the task completed on nothing.
    const { state, scheduler } = stubScheduler({
      model: model('ollama:local', 'local'),
      estimateUsd: 0,
      response: {},
    });
    await scheduler.run();
    expect(state.status).toBe('FAILED');
    expect(state.tasks[0].state).toBe('FAILED');
    expect(state.proofs).toHaveLength(0);
    const check = state.events.all().find((e) => e.type === 'proof.check');
    expect(check?.message).toMatch(/no repository root/);
  });

  it('fails the task and stops hiring when a bill overshoots the hard budget', async () => {
    // $0.05 reserved of $0.10, then the provider reported 20k completion tokens
    // at $15/M: a $0.30 bill. The spend is real and must show; the task must
    // not be handed to another worker; the mission loop must not crash.
    const { state, scheduler } = stubScheduler({
      spec: { budget: { maxUsd: 0.1, hard: true }, privacy: { mode: 'cloud-allowed' } },
      model: model('paid:frontier', 'paid'),
      estimateUsd: 0.05,
      response: { promptTokens: 0, completionTokens: 20_000 },
    });
    await expect(scheduler.run()).resolves.toBe(state);

    const ledger = state.budget.snapshot();
    expect(ledger.settledUsd).toBeCloseTo(0.3);
    expect(ledger.overshot).toBe(true);
    expect(state.status).toBe('FAILED');
    expect(state.tasks[0].state).toBe('FAILED');
    expect(state.workers).toHaveLength(1);
    expect(state.workers[0].failureType).toBe('POLICY_BLOCK');
    expect(state.workers[0].actualCostUsd).toBeCloseTo(0.3);
    const blocked = state.events.all().find((e) => e.type === 'budget.blocked');
    expect(blocked?.message).toMatch(/overshot hard budget/);
  });
});
