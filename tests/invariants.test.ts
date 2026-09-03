import { describe, it, expect } from 'vitest';
import { BudgetGovernor, BudgetExceededError, FRONTIER_BASELINE } from '../src/core/budget';
import { validateDag, readyTasks, isBlocked, canTransition, DagError } from '../src/core/dag';
import { runAuction } from '../src/core/auction';
import { checkEligibility, isCommandAllowed } from '../src/core/policy';
import { compileMissionSpec, parseTaskPlan, PlanRejectedError } from '../src/core/compiler';
import { buildCheckpoint, contextReduction, renderCheckpoint } from '../src/core/checkpoint';
import { ReputationStore } from '../src/core/reputation';
import { redactText, redactObject, MissionEventLog } from '../src/core/events';
import { parseWorkerOutput, InvalidWorkerOutputError } from '../src/core/worker-output';
import { computeQualityScore } from '../src/core/verify';
import { safeJoin } from '../src/core/context';
import { FaultInjector, INJECTED_RATE_LIMIT } from '../src/core/faults';
import type {
  ContextBundle,
  MissionSpec,
  MissionTask,
  ModelDescriptor,
  ProviderHealth,
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
    expect(() => parseTaskPlan(raw, spec, () => [])).toThrow(DagError);
  });

  it('strips a planner file scope that escapes the repository', () => {
    const spec = mission();
    const raw = JSON.stringify({
      tasks: [{ id: 'a', title: 'A', dependencies: [], fileScope: ['../../etc/passwd', 'src/a.js'] }],
    });
    const tasks = parseTaskPlan(raw, spec, () => []);
    expect(tasks[0].fileScope).toEqual(['src/a.js']);
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
