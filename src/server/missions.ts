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

/**
 * Server-side mission registry.
 *
 * Process-local, with a JSON snapshot on disk so a completed mission survives a
 * restart and can still be opened, shared and used as demo evidence. It is behind
 * this module boundary on purpose: `src/db/supabase.ts` implements the same shape
 * and swapping it changes nothing above this file.
 *
 * Durable multi-instance persistence is a genuine gap and is recorded in
 * BLOCKERS_REQUIRING_HUMAN.md rather than papered over.
 */

const STATE_DIR = path.resolve('.leverage-state');
const RUNS_DIR = path.join(STATE_DIR, 'runs');

/**
 * Persisted runs are stored one directory per workspace.
 *
 * The snapshot returned to clients carries no workspace id, so a flat directory
 * gave the read path nothing to check tenancy against — it read any completed
 * mission by id for any caller, which made the id an enumeration oracle for other
 * tenants' work. Scoping by directory makes the check structural: a caller can only
 * name a path inside its own workspace, so there is no check for a future route to
 * forget.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

function runsDirFor(workspaceId: string): string | null {
  if (!SAFE_SEGMENT.test(workspaceId)) return null;
  return path.join(RUNS_DIR, workspaceId);
}

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
    repositoryRoot: path.resolve('benchmark/forge-app'),
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
const DEMO_RUN_FILES = ['canonical-run.json', 'arcade-run.json'];

async function loadDemoRuns(): Promise<MissionSnapshot[]> {
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

  if (!/^LVR-[A-Za-z0-9-]{1,40}$/.test(missionId)) return null;
  const dir = runsDirFor(workspaceId);
  if (!dir) return null;
  try {
    const raw = await fs.readFile(path.join(dir, `${missionId}.json`), 'utf8');
    return JSON.parse(raw) as MissionSnapshot;
  } catch {
    return null;
  }
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

export function cancelMission(missionId: string, workspaceId: string): boolean {
  const entry = missions.get(missionId);
  if (!entry || entry.state.spec.workspaceId !== workspaceId) return false;
  entry.scheduler?.cancel();
  return true;
}

async function persist(state: MissionState): Promise<void> {
  try {
    const dir = runsDirFor(state.spec.workspaceId);
    if (!dir) return;
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${state.spec.id}.json`),
      JSON.stringify(snapshotMission(state), null, 2),
    );
  } catch {
    // Persistence is for convenience here; losing it must not fail a mission.
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

/** Completed runs written to disk by a previous process, for one workspace. */
export async function loadPersistedRuns(workspaceId: string): Promise<MissionSnapshot[]> {
  if (workspaceId === DEMO_WORKSPACE_ID) return loadDemoRuns();

  const dir = runsDirFor(workspaceId);
  if (!dir) return [];
  try {
    const files = await fs.readdir(dir);
    const runs = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))),
    );
    return runs as MissionSnapshot[];
  } catch {
    return [];
  }
}
