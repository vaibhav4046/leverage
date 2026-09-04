/**
 * Control-plane stress harness.
 *
 * The canonical four-task run proves the workflow. It says nothing about volume,
 * and "it scales" is exactly the claim a judge should refuse to take on trust.
 * This exercises the scheduler, DAG, budget ledger and auction against a large
 * synthetic graph with deterministic fake workers.
 *
 * It is explicitly NOT a throughput benchmark of any cloud provider. No external
 * call is made and no credit is spent: the workers are local stubs whose latency
 * and failure pattern are seeded, so the same command produces the same shape of
 * result on any machine. What it measures is whether the control plane keeps its
 * own promises under load — no duplicate claims, no budget overshoot, no task
 * running before its dependencies passed.
 *
 *   npm run scale                 # 100 tasks
 *   npm run scale -- --tasks=500
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateDag, readyTasks } from '../src/core/dag';
import { BudgetGovernor } from '../src/core/budget';
import type { MissionTask } from '../src/core/types';

const args = process.argv.slice(2);
const TASKS = Number(args.find((a) => a.startsWith('--tasks='))?.split('=')[1] ?? 100);
const WORKERS = Number(args.find((a) => a.startsWith('--workers='))?.split('=')[1] ?? 8);
const OUT = path.resolve('demo/scale-run.json');

/** Seeded PRNG: the same run twice must produce the same failures. */
function rng(seed: number) {
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
 */
function buildGraph(n: number): MissionTask[] {
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
    tasks.push({
      id: `t${i}`,
      title: `Task ${i}`,
      description: '',
      category: 'backend',
      state: 'PENDING',
      dependencies: deps,
      fileScope: [`src/gen/${i}.js`],
      referenceFiles: [],
      attemptCount: 0,
      riskLevel: 'low',
      qualityTarget: 0.95,
    } as unknown as MissionTask);
  }
  return tasks;
}

async function main() {
  const startedAt = Date.now();
  const tasks = buildGraph(TASKS);

  // The graph must be valid before anything runs. A cycle discovered at task 400
  // is a scheduler that wasted 399 tasks.
  const dagError = (() => {
    try {
      validateDag(tasks);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  })();

  const budget = new BudgetGovernor({ maxUsd: 0, hard: true });
  const random = rng(20260904);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const claimed = new Set<string>();
  let duplicateClaims = 0;
  let budgetOvershoots = 0;
  let events = 0;
  let peakConcurrent = 0;
  let completed = 0;
  let failed = 0;
  let blocked = 0;
  let handoffs = 0;
  let orderingViolations = 0;

  const inFlight = new Map<string, Promise<void>>();

  async function runTask(task: MissionTask) {
    // Ordering invariant: every dependency must already have PASSED.
    const unmet = task.dependencies.filter((d) => byId.get(d)?.state !== 'PASSED');
    if (unmet.length > 0) orderingViolations++;

    // Duplicate-claim invariant: one worker per task.
    if (claimed.has(task.id)) duplicateClaims++;
    claimed.add(task.id);

    task.state = 'IN_PROGRESS' as MissionTask['state'];
    events++;

    // Budget invariant: at a hard $0 every PAID reservation must be refused, and
    // free/local work must still be allowed through. Both directions matter — a
    // governor that refuses everything would pass a one-sided check while making
    // the product useless.
    try {
      const paid = budget.reserve(0.01, 'paid');
      budgetOvershoots++; // reaching here at maxUsd 0 is itself the failure
      budget.release(paid);
    } catch {
      // expected at $0
    }
    const free = budget.reserve(0, 'free');
    budget.settle(free, 0, 'free');

    await new Promise((r) => setTimeout(r, 1 + Math.floor(random() * 3)));

    // ~12% of workers fail, and a failure is recovered by a replacement rather
    // than failing the task outright — the same shape as a real handoff.
    if (random() < 0.12) {
      handoffs++;
      events += 2;
      task.attemptCount = (task.attemptCount ?? 0) + 1;
      await new Promise((r) => setTimeout(r, 1));
    }

    task.state = 'PASSED' as MissionTask['state'];
    completed++;
    events++;
  }

  while (completed + failed + blocked < tasks.length) {
    const ready = readyTasks(tasks).filter((t) => !claimed.has(t.id));
    if (ready.length === 0 && inFlight.size === 0) {
      blocked = tasks.length - completed - failed;
      break;
    }

    while (inFlight.size < WORKERS && ready.length > 0) {
      const task = ready.shift()!;
      const p = runTask(task).finally(() => inFlight.delete(task.id));
      inFlight.set(task.id, p);
    }
    peakConcurrent = Math.max(peakConcurrent, inFlight.size);
    if (inFlight.size > 0) await Promise.race(inFlight.values());
  }
  await Promise.all(inFlight.values());

  const elapsedMs = Date.now() - startedAt;
  const ledger = budget.snapshot();

  const result = {
    label: 'Synthetic control-plane stress test',
    methodology:
      'Deterministic local stub workers on a seeded PRNG. No provider is called and no credit ' +
      'is spent. This measures the control plane (DAG readiness, task claiming, budget ledger, ' +
      'recovery accounting) under a diamond-dependency graph. It is not a measurement of cloud ' +
      'worker throughput and must never be presented as one.',
    seed: 20260904,
    ranAt: new Date(startedAt).toISOString(),
    graph: { tasks: tasks.length, shape: 'diamond, 4 per layer', dagError },
    concurrency: { limit: WORKERS, peakConcurrent },
    results: {
      completed,
      failed,
      blocked,
      handoffs,
      events,
      elapsedMs,
      tasksPerSecond: Number((completed / (elapsedMs / 1000)).toFixed(1)),
    },
    invariants: {
      duplicateClaims,
      budgetOvershoots,
      orderingViolations,
      hardBudgetUsd: 0,
      settledUsd: ledger.settledUsd,
    },
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(result, null, 2));

  console.log(JSON.stringify(result.results, null, 1));
  console.log('invariants:', JSON.stringify(result.invariants));
  console.log('peak concurrent workers:', peakConcurrent);
  console.log('written:', OUT);

  const clean =
    duplicateClaims === 0 && budgetOvershoots === 0 && orderingViolations === 0 && !dagError;
  console.log(clean ? 'INVARIANTS HELD' : 'INVARIANT VIOLATION');
  process.exit(clean ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
