/**
 * Control-plane stress harness.
 *
 * The canonical four-task run proves the workflow. It says nothing about volume,
 * and "it scales" is exactly the claim a judge should refuse to take on trust.
 *
 * This drives the real MissionScheduler (src/core/scheduler.ts), the same class
 * that `startMission` and `scripts/run-mission.ts` construct, over a large
 * synthetic task graph. The substitutions are all at the edges:
 *
 *   - Providers are stub adapters registered in a real ProviderRegistry. Their
 *     latency and outages are scripted up front from one seeded PRNG, per task
 *     and per attempt, so the same command produces the same handoffs on any
 *     machine regardless of how the workers interleave.
 *   - The RocketRide executor is a stub that counts calls; `useRocketRide` is
 *     off, every worker is invoked directly, and a call to the stub is a failure.
 *   - The mission repository is an empty temporary directory, removed when the
 *     run ends. Each task's verification is the scheduler's default for its file
 *     scope, a `file-exists` check, run by the real verification engine. No test
 *     command is spawned, so no child process runs. Test-suite verification is
 *     exercised by the recorded missions, not here.
 *
 * Everything else is the scheduler's own code: DAG readiness, claiming, the
 * auction and policy filter, the context compiler, the budget governor, the
 * scoped write path, verification, checkpoints and handoffs. The invariants
 * below are read back from the scheduler's event log, not from counters the
 * harness maintains for itself, so a scheduler that broke a promise would have
 * to lie in its own log to pass.
 *
 * It is explicitly NOT a throughput benchmark of any cloud provider. No external
 * call is made and no credit is spent.
 *
 *   npm run scale                            # 100 tasks, 8 concurrent workers
 *   npm run scale -- --tasks=500 --workers=16
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SCHEDULER_OPTIONS, MissionScheduler } from '../src/core/scheduler';
import { createMissionState, defaultChecksFor } from '../src/core/mission';
import { validateDag } from '../src/core/dag';
import { ReputationStore } from '../src/core/reputation';
import { ProviderRegistry } from '../src/providers/registry';
import type { RocketRideExecutor } from '../src/rocketride/executor';
import type {
  CostClass,
  MissionEvent,
  MissionSpec,
  MissionTask,
  ModelDescriptor,
  NormalizedModelRequest,
  NormalizedModelResponse,
  ProviderAdapter,
  ProviderFailure,
  ProviderHealth,
  UsageEstimate,
} from '../src/core/types';

const args = process.argv.slice(2);
const TASKS = Number(args.find((a) => a.startsWith('--tasks='))?.split('=')[1] ?? 100);
const WORKERS = Number(args.find((a) => a.startsWith('--workers='))?.split('=')[1] ?? 8);
const SEED = 20260904;
/** Share of worker invocations that end in a provider outage. */
const OUTAGE_RATE = 0.12;
const OUT = path.resolve('demo/scale-run.json');

/** Seeded PRNG: the same run twice must produce the same outages. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * A diamond-heavy graph, not a chain.
 *
 * A chain of N tasks tests nothing about parallelism: only one task is ever ready.
 * Each layer here fans out and rejoins, so at any moment several tasks are ready
 * at once and the scheduler has to decide who runs.
 *
 * The title is the task id. It is the one thing about the task that reaches a
 * provider adapter (the ask begins "Complete this task: <title>."), and the stub
 * uses it to look up its scripted outcome.
 */
function buildGraph(n: number, missionId: string): MissionTask[] {
  const now = new Date().toISOString();
  const tasks: MissionTask[] = [];
  const layerSize = 4;
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / layerSize);
    const deps: string[] = [];
    if (layer > 0) {
      const prevStart = (layer - 1) * layerSize;
      for (let j = prevStart; j < Math.min(prevStart + layerSize, n); j++) {
        if (j !== i && (i + j) % 2 === 0) deps.push(`t${j}`);
      }
      if (deps.length === 0) deps.push(`t${prevStart}`);
    }
    // The stub writes `src/gen/<task id>.js`; the scope must name the same path or
    // the scheduler refuses the write and verification fails, as it should.
    const fileScope = [`src/gen/t${i}.js`];
    tasks.push({
      id: `t${i}`,
      missionId,
      title: `t${i}`,
      description: `Synthetic task ${i} in layer ${layer}.`,
      category: 'backend',
      dependencies: deps,
      requiredCapabilities: [{ capability: 'code', weight: 1 }],
      risk: 'low',
      qualityTarget: 0.95,
      budgetUsd: 0,
      fileScope,
      referenceFiles: [],
      verification: { checks: defaultChecksFor({ category: 'backend', fileScope }), acceptance: [] },
      state: 'PENDING',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  return tasks;
}

interface Draw {
  latencyMs: number;
  outage: boolean;
}

/**
 * Script every worker outcome before the run starts: one draw per task per
 * possible attempt, in task order, from a single seeded stream. Which stub model
 * wins the auction and how the workers interleave cannot change the result.
 */
function scriptOutcomes(tasks: MissionTask[], seed: number, attempts: number): Map<string, Draw[]> {
  const random = rng(seed);
  const script = new Map<string, Draw[]>();
  for (const task of tasks) {
    const draws: Draw[] = [];
    for (let a = 0; a < attempts; a++) {
      draws.push({ latencyMs: 1 + Math.floor(random() * 3), outage: random() < OUTAGE_RATE });
    }
    script.set(task.id, draws);
  }
  return script;
}

class StubOutage extends Error {}

/**
 * A provider that answers from the script. An outage is thrown from `invoke` and
 * classified as PROVIDER_5XX, which is not the worker's fault, so the scheduler
 * checkpoints, cools the model down for one auction and hires a replacement:
 * the same path a real 5xx takes.
 */
class StubAdapter implements ProviderAdapter {
  invocations = 0;
  outages = 0;

  constructor(
    readonly providerId: string,
    readonly costClass: CostClass,
    private readonly models: ModelDescriptor[],
    private readonly draw: (taskId: string) => Draw,
  ) {}

  async discoverModels(): Promise<ModelDescriptor[]> {
    return this.models;
  }

  async health(): Promise<ProviderHealth> {
    return { status: 'HEALTHY', checkedAt: new Date().toISOString() };
  }

  estimate(model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate {
    const estimatedPromptTokens = Math.ceil((request.system.length + request.user.length) / 4);
    const estimatedCompletionTokens = 64;
    return {
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostUsd:
        (estimatedPromptTokens / 1e6) * model.pricing.inputPerMTok +
        (estimatedCompletionTokens / 1e6) * model.pricing.outputPerMTok,
    };
  }

  async invoke(model: ModelDescriptor, request: NormalizedModelRequest): Promise<NormalizedModelResponse> {
    this.invocations += 1;
    const taskId = /Complete this task: (\S+)\./.exec(request.system)?.[1] ?? 'unknown';
    const { latencyMs, outage } = this.draw(taskId);
    await new Promise((resolve) => setTimeout(resolve, latencyMs));
    if (outage) {
      this.outages += 1;
      throw new StubOutage(`${model.displayName}: scripted provider outage`);
    }
    const text = [
      `### FILE: src/gen/${taskId}.js`,
      '```js',
      `export const task = '${taskId}';`,
      '```',
      '',
      '### NOTES',
      `decisions: stub output from ${model.displayName}`,
    ].join('\n');
    return { text, promptTokens: 200, completionTokens: 40, durationMs: latencyMs };
  }

  classifyError(error: unknown): ProviderFailure {
    return {
      type: 'PROVIDER_5XX',
      message: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

function stubModel(
  providerId: string,
  modelId: string,
  costClass: CostClass,
  pricing = { inputPerMTok: 0, outputPerMTok: 0 },
): ModelDescriptor {
  return {
    key: `${providerId}:${modelId}`,
    providerId,
    modelId,
    displayName: modelId,
    costClass,
    pricing,
    contextTokens: 32_000,
    capabilities: ['code', 'backend', 'reasoning'],
    supportsTools: true,
  };
}

/**
 * The scheduler's promises, checked against its own event log.
 *
 *   duplicate claim      a task is hired while a previous worker still holds it
 *   ordering violation   a task is hired before every dependency has completed
 *   concurrency breach   more workers active at once than the configured limit
 *   paid hire            a paid model was hired under a hard $0 budget
 */
function auditLog(events: MissionEvent[], tasks: MissionTask[], limit: number, paidKey: string) {
  const deps = new Map(tasks.map((t) => [t.id, t.dependencies]));
  const completed = new Set<string>();
  const active = new Map<string, string>();
  const audit = {
    duplicateClaims: 0,
    orderingViolations: 0,
    concurrencyBreaches: 0,
    peakConcurrent: 0,
    paidHires: 0,
    paidCandidatesStruckOut: 0,
    hires: 0,
    handoffs: 0,
  };

  for (const e of events) {
    const taskId = e.taskId ?? '';
    switch (e.type) {
      case 'worker.hired':
        audit.hires += 1;
        if (active.has(taskId)) audit.duplicateClaims += 1;
        active.set(taskId, e.workerRunId ?? '');
        if (e.data?.costClass === 'paid') audit.paidHires += 1;
        for (const dep of deps.get(taskId) ?? []) {
          if (!completed.has(dep)) audit.orderingViolations += 1;
        }
        audit.peakConcurrent = Math.max(audit.peakConcurrent, active.size);
        if (active.size > limit) audit.concurrencyBreaches += 1;
        break;
      case 'worker.released':
      case 'task.failed':
        active.delete(taskId);
        break;
      case 'task.completed':
        active.delete(taskId);
        completed.add(taskId);
        break;
      case 'handoff.started':
        audit.handoffs += 1;
        break;
      case 'auction.candidate':
        if (e.data?.eligible === false && e.data?.modelKey === paidKey) {
          audit.paidCandidatesStruckOut += 1;
        }
        break;
    }
  }
  return audit;
}

async function main() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'leverage-scale-'));
  let exitCode = 1;
  try {
    exitCode = await run(repoRoot);
  } finally {
    await fs.rm(repoRoot, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

async function run(repoRoot: string): Promise<number> {
  const spec: MissionSpec = {
    id: `LVR-scale-${SEED}`,
    workspaceId: 'ws_scale',
    createdBy: 'scale-harness',
    goal: `Synthetic ${TASKS}-task diamond graph against stub providers`,
    repository: { root: repoRoot, label: 'scale-harness temp' },
    constraints: [],
    budget: { maxUsd: 0, hard: true },
    quality: { target: 0.95 },
    privacy: { mode: 'prefer-local' },
    parallelism: { mode: 'fixed', maxWorkers: WORKERS },
    createdAt: new Date().toISOString(),
  };
  const tasks = buildGraph(TASKS, spec.id);

  // The graph must be valid before anything runs. The scheduler checks this itself
  // on entry; checking it here too lets the report say why nothing ran.
  const dagError = (() => {
    try {
      validateDag(tasks);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  })();

  const script = scriptOutcomes(tasks, SEED, DEFAULT_SCHEDULER_OPTIONS.maxAttemptsPerTask);
  const draw = (taskId: string): Draw =>
    script.get(taskId)?.shift() ?? { latencyMs: 1, outage: false };

  const local = new StubAdapter(
    'stub-local',
    'local',
    [stubModel('stub-local', 'stub-local-a', 'local'), stubModel('stub-local', 'stub-local-b', 'local')],
    draw,
  );
  const free = new StubAdapter('stub-free', 'free', [stubModel('stub-free', 'stub-free-a', 'free')], draw);
  // Registered so every auction has a paid route to strike out. Hiring it, or
  // invoking it, is a budget violation at a hard $0.
  const paidModel = stubModel('stub-paid', 'stub-paid-frontier', 'paid', {
    inputPerMTok: 3,
    outputPerMTok: 15,
  });
  const paid = new StubAdapter('stub-paid', 'paid', [paidModel], draw);

  const registry = new ProviderRegistry();
  registry.register(local, 'stub local runtime');
  registry.register(free, 'stub free route');
  registry.register(paid, 'stub paid API');

  let executorCalls = 0;
  const executor = {
    runWorker: async () => {
      executorCalls += 1;
      throw new Error('RocketRide executor called: the harness runs every worker directly');
    },
  } as unknown as RocketRideExecutor;

  const state = createMissionState(spec, tasks);
  const scheduler = new MissionScheduler(
    state,
    { registry, executor, reputation: new ReputationStore() },
    { maxConcurrency: WORKERS, useRocketRide: false, workerTimeoutMs: 10_000 },
  );

  const startedAt = Date.now();
  if (!dagError) await scheduler.run();
  const elapsedMs = Date.now() - startedAt;

  const events = state.events.all();
  const audit = auditLog(events, tasks, WORKERS, paidModel.key);
  const ledger = state.budget.snapshot();
  const completed = tasks.filter((t) => t.state === 'PASSED').length;
  const failed = tasks.filter((t) => t.state === 'FAILED').length;
  const blocked = tasks.filter((t) => t.state === 'BLOCKED').length;
  // Left PENDING when the scheduler stopped because nothing upstream could run.
  const unscheduled = tasks.length - completed - failed - blocked;
  const outages = local.outages + free.outages + paid.outages;

  const budgetOvershoots =
    audit.paidHires +
    paid.invocations +
    (ledger.settledUsd + ledger.reservedUsd > ledger.maxUsd ? 1 : 0);

  const result = {
    label: 'Synthetic control-plane stress test',
    methodology:
      'The real MissionScheduler run over a diamond-dependency graph with stub provider ' +
      'adapters whose outages are scripted from a seeded PRNG. No provider is called and no ' +
      'credit is spent. The repository is an empty temporary directory; each task is verified ' +
      'by the default file-exists check for its file scope, so no test command is spawned. ' +
      'Invariants are read from the scheduler event log. It measures the control plane (DAG ' +
      'readiness, claiming, auction and policy filter, budget ledger, scoped writes, ' +
      'verification, checkpoint and handoff) under load. It is not a measurement of cloud ' +
      'worker throughput and must never be presented as one.',
    seed: SEED,
    ranAt: new Date(startedAt).toISOString(),
    graph: { tasks: tasks.length, shape: 'diamond, 4 per layer', dagError },
    concurrency: { limit: WORKERS, peakConcurrent: audit.peakConcurrent },
    results: {
      missionStatus: state.status,
      completed,
      failed,
      blocked,
      unscheduled,
      workersHired: audit.hires,
      handoffs: audit.handoffs,
      outagesScripted: outages,
      events: events.length,
      elapsedMs,
      tasksPerSecond: Number((completed / (elapsedMs / 1000)).toFixed(1)),
    },
    invariants: {
      duplicateClaims: audit.duplicateClaims,
      orderingViolations: audit.orderingViolations,
      concurrencyBreaches: audit.concurrencyBreaches,
      budgetOvershoots,
      paidCandidatesStruckOut: audit.paidCandidatesStruckOut,
      executorCalls,
      // Every scripted outage must show up in the log as a handoff, or as the
      // failure that ended a task's attempts, and nothing else may cause one. An
      // outage the log cannot account for is a worker that vanished without a
      // checkpoint; a handoff the script did not cause is a failure the harness
      // did not intend, such as verification refusing a stub's output.
      unaccountedOutages: Math.max(0, outages - audit.handoffs - failed),
      unexplainedHandoffs: Math.max(0, audit.handoffs + failed - outages),
      hardBudgetUsd: ledger.maxUsd,
      settledUsd: ledger.settledUsd,
      paidCalls: ledger.paidCalls,
      localCalls: ledger.localCalls,
      freeCalls: ledger.freeCalls,
    },
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result.results, null, 1));
  console.log('invariants:', JSON.stringify(result.invariants));
  console.log('peak concurrent workers:', audit.peakConcurrent, '/', WORKERS);
  console.log('written:', OUT);

  const clean =
    !dagError &&
    audit.duplicateClaims === 0 &&
    audit.orderingViolations === 0 &&
    audit.concurrencyBreaches === 0 &&
    budgetOvershoots === 0 &&
    executorCalls === 0 &&
    result.invariants.unaccountedOutages === 0 &&
    result.invariants.unexplainedHandoffs === 0;
  if (!clean) {
    // The log knows why. Show the first failures so a red run explains itself.
    const failures = events.filter((e) => e.type === 'worker.failed' || e.type === 'task.failed');
    for (const e of failures.slice(0, 5)) console.log(`  ${e.type} [${e.taskId}] ${e.message}`);
  }
  console.log(clean ? 'INVARIANTS HELD' : 'INVARIANT VIOLATION');
  return clean ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
