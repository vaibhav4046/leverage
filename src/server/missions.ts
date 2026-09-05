import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { compileMissionSpec } from '../core/compiler';
import { createMissionState, snapshotMission, type MissionSnapshot } from '../core/mission';
import { MissionScheduler, type MissionState } from '../core/scheduler';
import { ReputationStore } from '../core/reputation';
import { buildRegistry, ProviderRegistry } from '../providers/registry';
import { FaultInjector, INJECTED_RATE_LIMIT } from '../core/faults';
import { RocketRideExecutor } from '../rocketride/executor';
import type { MissionTask } from '../core/types';
import { buildFixturePlan } from './fixture-plan';
import { DEMO_WORKSPACE_ID } from '../auth/identity';
import { getRepository } from '../db';

/**
 * Server-side mission registry.
 *
 * Live missions are process-local; completed ones are written through a
 * `MissionRepository` (`src/db/`) so a finished run survives a restart and can still
 * be opened, shared and used as evidence. Which repository is a configuration
 * choice: the filesystem one by default, Postgres when Supabase is configured.
 * Nothing in this file knows the difference.
 *
 * Durable multi-instance persistence for *in-flight* missions is still a genuine gap
 * — the live scheduler state lives in this process — and is recorded in
 * BLOCKERS_REQUIRING_HUMAN.md rather than papered over.
 */

const STATE_DIR = path.resolve('.leverage-state');

interface Entry {
  state: MissionState;
  scheduler?: MissionScheduler;
  running: boolean;
}

/**
 * Pinned to globalThis.
 *
 * Next bundles route handlers and server components into separate module graphs, so
 * a plain module-level Map becomes two Maps: a mission created through the API was
 * invisible to the page that renders it, which showed up as a 404 on a mission the
 * API happily returned. One process, one registry.
 */
const globalStore = globalThis as unknown as {
  __leverageMissions?: Map<string, Entry>;
  __leverageIdempotency?: Map<string, string>;
};
const missions: Map<string, Entry> = (globalStore.__leverageMissions ??= new Map());

let registry: ProviderRegistry | null = null;
let reputation: ReputationStore | null = null;
let executor: RocketRideExecutor | null = null;

export function getRegistry(): ProviderRegistry {
  if (!registry) {
    registry = buildRegistry({
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
      poolBaseUrl: process.env.OMNIROUTE_BASE_URL,
      poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
    });
  }
  return registry;
}

export function getExecutor(): RocketRideExecutor {
  if (!executor) {
    executor = new RocketRideExecutor({
      apiKey: process.env.ROCKETRIDE_APIKEY ?? '',
      uri: process.env.ROCKETRIDE_URI ?? 'https://staging.rocketride.ai',
      poolBaseUrl:
        process.env.LEVERAGE_POOL_URL ?? process.env.OMNIROUTE_BASE_URL ?? 'http://127.0.0.1:20128',
      poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
    });
  }
  return executor;
}

export async function getReputation(): Promise<ReputationStore> {
  if (reputation) return reputation;
  try {
    const raw = await fs.readFile(path.join(STATE_DIR, 'reputation.json'), 'utf8');
    reputation = ReputationStore.fromJSON(JSON.parse(raw));
  } catch {
    reputation = new ReputationStore();
  }
  return reputation;
}

export interface CreateMissionInput {
  goal: string;
  workspaceId: string;
  userId: string;
  budgetMaxUsd?: number;
  qualityTarget?: number;
  privacy?: 'local-only' | 'prefer-local' | 'cloud-allowed';
  maxWorkers?: number;
  injectFailure?: boolean;
  /** Idempotency key: the same key returns the same mission rather than a second one. */
  idempotencyKey?: string;
  /**
   * Where the mission writes. Defaults to the checked-in fixture; a live run on a
   * read-only filesystem passes a copy of it in the function's temp directory.
   */
  repositoryRoot?: string;
}

const idempotency: Map<string, string> = (globalStore.__leverageIdempotency ??= new Map());

export async function createMission(input: CreateMissionInput): Promise<MissionSnapshot> {
  if (input.idempotencyKey) {
    const existing = idempotency.get(input.idempotencyKey);
    if (existing) {
      const entry = missions.get(existing);
      if (entry) return snapshotMission(entry.state);
    }
  }

  const spec = compileMissionSpec({
    goal: input.goal,
    workspaceId: input.workspaceId,
    createdBy: input.userId,
    repositoryRoot: input.repositoryRoot ?? path.resolve('benchmark/forge-app'),
    repositoryLabel: 'forge-app',
    overrides: {
      budgetMaxUsd: input.budgetMaxUsd,
      qualityTarget: input.qualityTarget,
      privacy: input.privacy,
      maxWorkers: input.maxWorkers,
    },
  });

  const tasks: MissionTask[] = buildFixturePlan(spec.id);
  const state = createMissionState(spec, tasks);

  missions.set(spec.id, { state, running: false });
  if (input.idempotencyKey) idempotency.set(input.idempotencyKey, spec.id);

  return snapshotMission(state);
}

/**
 * A mission as a snapshot, from memory if it is live and from its persisted record
 * otherwise. A finished mission has to stay readable after the process that ran it
 * has gone -- that is the whole point of writing the record.
 */
/**
 * The recorded runs the public demo workspace is seeded with.
 *
 * A deployed instance cannot execute a mission — that needs a local repository to
 * write into and a local model pool to hire from — so an empty Mission Control
 * would be the honest but useless result. Seeding it with the runs that actually
 * happened lets the deployed app show the real thing it produces, while every
 * mutation stays refused. These are the same files the evidence pages read, so the
 * app and the marketing cannot disagree.
 */
const DEMO_RUN_FILES = [
  'canonical-run.json',
  'arcade-run.json',
  // The run where RocketRide actually did the work: three of its six workers were
  // free-class, which routes them through the RocketRide executor, and all four
  // tasks passed verification. It is the single strongest answer to "is RocketRide
  // load-bearing or decorative", and it was sitting on disk unreadable by anyone
  // without a terminal and a staging key.
  'rocketride-mission.json',
  // The same question answered again on the permanent hosted pool: every worker
  // free-class, every one a RocketRide pipeline, no tunnel anywhere.
  'hosted-pool-mission.json',
];

/**
 * In production the run files never change between deploys, and the missions list
 * serialises about 340 KB per hit, so parsing them on every request is
 * amplification for nothing. In development they are re-read, because a mission
 * runner may have just written a new one.
 */
let demoRunsMemo: Promise<MissionSnapshot[]> | null = null;

function loadDemoRuns(): Promise<MissionSnapshot[]> {
  if (process.env.NODE_ENV !== 'production') return readDemoRuns();
  if (!demoRunsMemo) demoRunsMemo = readDemoRuns();
  return demoRunsMemo;
}

async function readDemoRuns(): Promise<MissionSnapshot[]> {
  const runs = await Promise.all(
    DEMO_RUN_FILES.map(async (file) => {
      try {
        const raw = await fs.readFile(path.resolve('demo', file), 'utf8');
        return JSON.parse(raw) as MissionSnapshot;
      } catch {
        return null;
      }
    }),
  );
  return runs.filter((r): r is MissionSnapshot => r !== null);
}

export async function getMissionSnapshot(
  missionId: string,
  workspaceId: string,
): Promise<MissionSnapshot | null> {
  const live = getMission(missionId, workspaceId);
  if (live) return snapshotMission(live);

  if (workspaceId === DEMO_WORKSPACE_ID) {
    const seeded = await loadDemoRuns();
    return seeded.find((r) => r.mission.id === missionId) ?? null;
  }

  return getRepository().get(workspaceId, missionId);
}

export function getMission(missionId: string, workspaceId: string): MissionState | null {
  const entry = missions.get(missionId);
  if (!entry) return null;
  // Tenancy check lives here so no route can forget it.
  if (entry.state.spec.workspaceId !== workspaceId) return null;
  return entry.state;
}

export function listMissions(workspaceId: string): MissionSnapshot[] {
  return [...missions.values()]
    .filter((e) => e.state.spec.workspaceId === workspaceId)
    .sort((a, b) => b.state.startedAt - a.state.startedAt)
    .map((e) => snapshotMission(e.state));
}

/**
 * Start a mission. Returns immediately; execution continues in the background and
 * is observed through the event stream.
 *
 * Starting twice is a no-op rather than a second workforce.
 */
export async function startMission(
  missionId: string,
  workspaceId: string,
  opts: { injectFailure?: boolean } = {},
): Promise<{ started: boolean; reason?: string }> {
  const entry = missions.get(missionId);
  if (!entry || entry.state.spec.workspaceId !== workspaceId) {
    return { started: false, reason: 'not found' };
  }
  if (entry.running) return { started: false, reason: 'already running' };
  if (entry.state.status !== 'QUEUED') {
    return { started: false, reason: `mission is ${entry.state.status}` };
  }

  const reg = getRegistry();
  await reg.sweep(true);

  const faults = opts.injectFailure
    ? new FaultInjector({ failOnDispatch: [1], fault: INJECTED_RATE_LIMIT })
    : undefined;
  if (faults) {
    entry.state.events.emit(
      'worker.progress',
      'Failure injection armed: the first dispatched worker will raise an INJECTED 429',
      { data: { injected: true } },
    );
  }

  const scheduler = new MissionScheduler(
    entry.state,
    { registry: reg, executor: getExecutor(), reputation: await getReputation(), faults },
    { maxConcurrency: entry.state.spec.parallelism.maxWorkers ?? 2 },
  );

  entry.scheduler = scheduler;
  entry.running = true;

  void scheduler
    .run()
    .catch((err) => {
      entry.state.events.emit('mission.failed', `Scheduler crashed: ${err?.message ?? err}`);
      entry.state.status = 'FAILED';
    })
    .finally(async () => {
      entry.running = false;
      await persist(entry.state);
      await persistReputation();
    });

  return { started: true };
}

/**
 * Resolve a pending approval on a running mission, then let it continue.
 *
 * The tenancy check lives here with every other one, so a route cannot forget it.
 * Restarting the scheduler after an approval is deliberate: `run()` returns when
 * the only remaining work is gated, so something has to start it again.
 */
export function resolveApproval(
  missionId: string,
  workspaceId: string,
  taskId: string,
  resolution: 'approved' | 'rejected',
  actor: string,
): boolean {
  const entry = missions.get(missionId);
  if (!entry || entry.state.spec.workspaceId !== workspaceId) return false;
  if (!entry.scheduler?.resolveApproval(taskId, resolution, actor)) return false;

  if (resolution === 'approved' && !entry.running) {
    entry.running = true;
    void entry.scheduler
      .run()
      .then((state) => persist(state))
      .finally(() => {
        entry.running = false;
      });
  }
  return true;
}

export function cancelMission(missionId: string, workspaceId: string): boolean {
  const entry = missions.get(missionId);
  if (!entry || entry.state.spec.workspaceId !== workspaceId) return false;
  entry.scheduler?.cancel();
  return true;
}

async function persist(state: MissionState): Promise<void> {
  try {
    await getRepository().save(state.spec.workspaceId, snapshotMission(state));
  } catch (err) {
    // A read-only filesystem (a live run inside a serverless function) cannot keep
    // the record; the run still happened and its snapshot went to the caller. An
    // unhandled rejection here would take the whole function down with it.
    state.events.emit('worker.progress', `Snapshot not persisted: ${(err as Error).message}`);
  }
}

async function persistReputation(): Promise<void> {
  if (!reputation) return;
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(STATE_DIR, 'reputation.json'),
      JSON.stringify(reputation.toJSON(), null, 2),
    );
  } catch {
    /* non-fatal */
  }
}

/** Completed runs from a previous process, for one workspace. */
export async function loadPersistedRuns(workspaceId: string): Promise<MissionSnapshot[]> {
  if (workspaceId === DEMO_WORKSPACE_ID) return loadDemoRuns();
  return getRepository().list(workspaceId);
}
