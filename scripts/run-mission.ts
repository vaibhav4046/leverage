/**
 * Run a real Leverage mission from the command line.
 *
 * This is the vertical slice the whole product rests on:
 *
 *   mission -> compile -> DAG -> auction -> hire -> RocketRide pipeline
 *           -> real model -> patch -> verify -> ProofPack
 *
 * Nothing here is simulated. Every worker is a real inference through a real
 * RocketRide pipeline, every check is a real process exit code, and the numbers it
 * prints are the numbers that happened.
 *
 *   npx tsx scripts/run-mission.ts --fixture --inject-429
 *   npx tsx scripts/run-mission.ts --repo=/abs/path/to/repo --goal="make test/ pass"
 *
 * With --repo, a planner model turns the goal and the repository into the task
 * graph (src/server/planner.ts); without it the bundled fixture runs its
 * committed plan. Cloud-class workers run as RocketRide pipelines when
 * ROCKETRIDE_APIKEY is set and are called directly when it is not.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileMissionSpec } from '../src/core/compiler';
import { createMissionState, snapshotMission } from '../src/core/mission';
import { MissionScheduler } from '../src/core/scheduler';
import { ReputationStore } from '../src/core/reputation';
import { buildRegistry } from '../src/providers/registry';
import { FaultInjector, INJECTED_RATE_LIMIT } from '../src/core/faults';
import { RocketRideExecutor } from '../src/rocketride/executor';
import { formatElapsed } from '../src/core/events';
import { buildFixturePlan } from '../src/server/fixture-plan';
import { buildArcadePlan } from '../src/server/arcade-plan';
import { announcePlan, planWithModel } from '../src/server/planner';

const args = new Set(process.argv.slice(2));
const INJECT = args.has('--inject-429');
const DIRECT = args.has('--direct');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const REPO_ARG = process.argv.find((a) => a.startsWith('--repo='))?.slice(7);
const GOAL_ARG = process.argv.find((a) => a.startsWith('--goal='))?.slice(7);

const ARCADE = args.has('--arcade');
const REPO = path.resolve(REPO_ARG ?? (ARCADE ? 'benchmark/arcade' : 'benchmark/forge-app'));
if (REPO_ARG && !GOAL_ARG) throw new Error('--repo needs --goal="what must be true when this is done"');
const STATE_DIR = path.resolve('.leverage-state');

async function main() {
  const poolUrl = process.env.LEVERAGE_POOL_URL ?? process.env.OMNIROUTE_BASE_URL;
  if (!poolUrl) throw new Error('Set LEVERAGE_POOL_URL (public) or OMNIROUTE_BASE_URL (local)');

  // ---- Providers ---------------------------------------------------------
  const registry = buildRegistry({
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    poolBaseUrl: process.env.OMNIROUTE_BASE_URL,
    poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
  });
  await registry.sweep(true);

  console.log('\nPROVIDERS');
  for (const p of registry.list()) {
    console.log(
      `  ${p.adapter.providerId.padEnd(8)} ${p.health.status.padEnd(12)} ${p.models.length} models  ${p.label}`,
    );
  }
  const models = registry.allModels();
  if (models.length === 0) throw new Error('No models discovered — nothing can be hired');

  // ---- Failure injection -------------------------------------------------
  // Deterministic, announced, and applied at dispatch so it lands on whichever
  // worker the auction actually hires. See demo/README.md.
  const faults = INJECT
    ? new FaultInjector({ failOnDispatch: [1], fault: INJECTED_RATE_LIMIT })
    : undefined;
  if (faults) {
    console.log('  Failure injection armed: dispatch #1 will raise an INJECTED 429');
  }

  // ---- Compile -----------------------------------------------------------
  const spec = compileMissionSpec({
    goal:
      GOAL_ARG ??
      (ARCADE
        ? 'Finish the arcade gravity-arena prototype so the whole existing test suite passes. ' +
          'Do not modify any file under test/. Budget: $0. Quality: production.'
        : 'Finish the forge-app receipt splitting library so the whole existing test suite passes. ' +
          'Do not modify any file under test/. Budget: $0. Quality: production.'),
    workspaceId: 'ws_local',
    createdBy: 'cli',
    repositoryRoot: REPO,
    repositoryLabel: REPO_ARG ? path.basename(REPO) : ARCADE ? 'arcade' : 'forge-app',
  });

  console.log('\nMISSION', spec.id);
  console.log('  budget    ', `$${spec.budget.maxUsd.toFixed(2)}`, spec.budget.hard ? '(HARD)' : '(soft)');
  console.log('  quality   ', spec.quality.target);
  console.log('  privacy   ', spec.privacy.mode);
  console.log('  constraints', spec.constraints.length ? spec.constraints.join(' | ') : '(none)');

  let tasks;
  let planned: Awaited<ReturnType<typeof planWithModel>> | null = null;
  if (REPO_ARG) {
    console.log('  planning   asking a model for the task graph...');
    planned = await planWithModel({ spec, goal: spec.goal, repositoryRoot: REPO, registry });
    tasks = planned.tasks;
    console.log(
      `  plan       ${tasks.length} tasks by ${planned.planner.displayName} (${planned.planner.costClass}) in ${(planned.planner.durationMs / 1000).toFixed(1)}s`,
    );
    for (const s of planned.planner.skipped) console.log(`             skipped ${s}`);
    for (const t of tasks) {
      const suite = t.verification.checks.find((c) => c.kind === 'command');
      console.log(`             ${t.id.padEnd(16)} ${t.title}  <- ${suite?.label ?? 'existence only'}`);
    }
  } else {
    tasks = ARCADE ? buildArcadePlan(spec.id) : buildFixturePlan(spec.id);
    console.log(`  plan       ${tasks.length} tasks (committed plan)`);
  }

  const reputation = await loadReputation();
  const state = createMissionState(spec, tasks);
  if (planned) announcePlan(state, planned.planner, tasks, planned.planText);

  // ---- Execute -----------------------------------------------------------
  const executor = new RocketRideExecutor({
    apiKey: process.env.ROCKETRIDE_APIKEY ?? '',
    uri: process.env.ROCKETRIDE_URI ?? 'https://staging.rocketride.ai',
    poolBaseUrl: poolUrl,
    poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
  });

  const creditsBefore = await executor.credits();
  if (creditsBefore) {
    console.log(`  rocketride credits ${creditsBefore.balance} / ${creditsBefore.granted}`);
  }

  state.events.subscribe((e) => {
    const tag = e.taskId ? ` [${e.taskId}]` : '';
    console.log(`${formatElapsed(e.elapsedMs)}  ${e.type.padEnd(22)}${tag} ${e.message}`);
  });

  const useRocketRide = !DIRECT && Boolean(process.env.ROCKETRIDE_APIKEY);
  console.log(
    `  executor   ${useRocketRide ? 'RocketRide pipelines for cloud-class workers' : 'direct calls (no ROCKETRIDE_APIKEY' + (DIRECT ? ', --direct' : '') + ')'}`,
  );
  const scheduler = new MissionScheduler(
    state,
    { registry, executor, reputation, faults },
    { useRocketRide, maxConcurrency: 2 },
  );

  process.on('SIGINT', () => {
    console.log('\nCancelling...');
    scheduler.cancel();
  });

  await scheduler.run();
  const creditsAfter = await executor.credits();
  await executor.close();

  // ---- Report ------------------------------------------------------------
  const snapshot = snapshotMission(state);
  const passed = state.tasks.filter((t) => t.state === 'PASSED').length;

  console.log('\n' + '='.repeat(72));
  console.log(`MISSION ${state.status}`);
  console.log('='.repeat(72));
  console.log(`  tasks passed        ${passed}/${state.tasks.length}`);
  console.log(`  workers hired       ${state.workers.length}`);
  console.log(`  handoffs            ${state.checkpoints.length}`);
  console.log(`  actual paid spend   $${snapshot.usage.paidSpendUsd.toFixed(2)}`);
  console.log(`  local / free calls  ${snapshot.usage.localCalls} / ${snapshot.usage.freeCalls}`);
  console.log(`  blocked paid tries  ${snapshot.usage.blockedPaidAttempts}`);
  console.log(
    `  est. frontier-equiv $${snapshot.usage.estimatedFrontierEquivalentUsd.toFixed(4)} (estimate, see BENCHMARKS.md)`,
  );
  if (creditsBefore && creditsAfter) {
    console.log(
      `  rocketride credits  ${creditsBefore.balance} -> ${creditsAfter.balance} (used ${(creditsBefore.balance - creditsAfter.balance).toFixed(2)})`,
    );
  }

  console.log('\n  FINAL SUITE');
  const { execArgv } = await import('../src/core/verify');
  const suite = await execArgv(['npm', 'test'], REPO, 120_000);
  const summary = suite.stdout.match(/# (pass|fail) \d+/g) ?? [];
  console.log(`  exit ${suite.code}  ${summary.join('  ')}`);

  await fs.mkdir(STATE_DIR, { recursive: true });
  await saveReputation(reputation);
  if (OUT) {
    await fs.mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
    await fs.writeFile(
      path.resolve(OUT),
      JSON.stringify({ ...snapshot, finalSuiteExitCode: suite.code }, null, 2),
    );
    console.log(`\n  canonical run written to ${OUT}`);
  }

  process.exit(state.status === 'COMPLETED' && suite.code === 0 ? 0 : 1);
}


async function loadReputation(): Promise<ReputationStore> {
  try {
    const raw = await fs.readFile(path.join(STATE_DIR, 'reputation.json'), 'utf8');
    return ReputationStore.fromJSON(JSON.parse(raw));
  } catch {
    return new ReputationStore();
  }
}

async function saveReputation(store: ReputationStore): Promise<void> {
  await fs.writeFile(
    path.join(STATE_DIR, 'reputation.json'),
    JSON.stringify(store.toJSON(), null, 2),
  );
}

main().catch((err) => {
  console.error('\nMISSION ABORTED:', err?.message ?? err);
  process.exit(1);
});
