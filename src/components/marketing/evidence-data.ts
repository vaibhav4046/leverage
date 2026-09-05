import fs from 'node:fs/promises';
import path from 'node:path';
import { ReputationStore } from '@/core/reputation';
import type { MissionSnapshot } from '@/core/mission';
import type { ModelRow } from '@/components/marketing/surfaces';

/**
 * Everything the landing page shows is read from a file in the repository when
 * the page renders: the recorded missions, the live-run transcripts, the scale
 * harness, the capability probe, the pool sweep and the RocketRide billing
 * capture. A loader that cannot find or parse its file returns null and the
 * panel it feeds does not render. Nothing here falls back to a typed number.
 *
 * In production the files never change between deploys, so each is parsed once
 * per process; parsing a megabyte of JSON per request was most of the page's
 * server time.
 */
const memo = new Map<string, Promise<unknown>>();

function once<T>(key: string, read: () => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'production') return read();
  let hit = memo.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = read();
    memo.set(key, hit);
  }
  return hit;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(path.resolve(file), 'utf8');
  } catch {
    return null;
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  const raw = await readText(file);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- missions */

export function loadRun(file: string): Promise<MissionSnapshot | null> {
  return once(`run:${file}`, () => readJson<MissionSnapshot>(path.join('demo', file)));
}

/**
 * The workforce ledger is this installation's own record, so it is read from the
 * committed observations rather than from a table anyone typed by hand.
 */
export function loadLedger(): Promise<ModelRow[]> {
  return once('ledger', async () => {
    const raw = await readText('demo/proof/model-observations.json');
    if (raw === null) return [];
    try {
      return ReputationStore.fromJSON(JSON.parse(raw))
        .leaderboard()
        .filter((r) => r.samples >= 2)
        .map((r) => ({
          displayName: r.modelKey.split(':').slice(1).join(':') || r.modelKey,
          costClass: r.modelKey.startsWith('ollama')
            ? 'local'
            : r.modelKey.startsWith('agent-cli') || r.modelKey.startsWith('host')
              ? 'host'
              : 'free',
          samples: r.samples,
          verified: r.verifiedSuccesses,
          successRate: r.successRate,
          medianLatencyMs: r.medianLatencyMs,
          confidence: r.confidence,
        }));
    } catch {
      return [];
    }
  });
}

/* --------------------------------------------------------------- live runs */

export interface LiveRun {
  missionId: string;
  /** True when a planner model wrote the task graph before anyone was hired. */
  planned: boolean;
  creditsBefore: number;
  creditsAfter: number;
  creditsUsed: number;
  elapsedMs: number;
  passed: number;
  total: number;
  /** Elapsed time at which the planner's graph was accepted, if there was one. */
  plannedAtMs: number | null;
  file: string;
}

/**
 * A live run on the deployed site is kept as the SSE transcript the visitor's
 * browser received, so the page reads the same bytes a visitor did: the credit
 * balance before, every mission event, and the balance after.
 */
export function loadLiveRun(file: string): Promise<LiveRun | null> {
  return once(`live:${file}`, async () => {
    const raw = await readText(path.join('demo/evidence', file));
    if (raw === null) return null;
    const payloads = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .flatMap((l) => {
        try {
          return [JSON.parse(l.slice(5)) as Record<string, unknown>];
        } catch {
          return [];
        }
      });
    const started = payloads.find(
      (p) => typeof p.creditsBefore === 'number' && typeof p.missionId === 'string',
    );
    const final = [...payloads].reverse().find((p) => typeof p.creditsAfter === 'number');
    const events = payloads.filter((p) => typeof p.type === 'string');
    const completed = events.find((e) => e.type === 'mission.completed');
    const compiled = events.find(
      (e) =>
        e.type === 'mission.compiled' && (e.data as { planner?: unknown } | undefined)?.planner,
    );
    if (!started || !final || !completed) return null;
    const outcome = completed.data as { passed?: number; failed?: number } | undefined;
    const before = started.creditsBefore as number;
    const after = final.creditsAfter as number;
    return {
      missionId: started.missionId as string,
      planned: started.plan === 'model',
      creditsBefore: before,
      creditsAfter: after,
      creditsUsed: Number((before - after).toFixed(1)),
      elapsedMs: Number(completed.elapsedMs ?? 0),
      passed: outcome?.passed ?? 0,
      total: (outcome?.passed ?? 0) + (outcome?.failed ?? 0),
      plannedAtMs: compiled ? Number(compiled.elapsedMs) : null,
      file,
    };
  });
}

/** Every live-run transcript in demo/evidence, committed plan first. */
export function loadLiveRuns(): Promise<LiveRun[]> {
  return once('live-runs', async () => {
    let files: string[];
    try {
      files = (await fs.readdir(path.resolve('demo/evidence'))).filter((f) => /^live-.*\.sse$/.test(f));
    } catch {
      return [];
    }
    const runs = await Promise.all(files.map((f) => loadLiveRun(f)));
    return runs
      .filter((r): r is LiveRun => r !== null)
      .sort((a, b) => Number(a.planned) - Number(b.planned));
  });
}

/* ------------------------------------------------------------ other proof */

export interface ScaleRun {
  tasks: number;
  completed: number;
  workersHired: number;
  handoffs: number;
  outagesScripted: number;
  duplicateClaims: number;
  orderingViolations: number;
  budgetOvershoots: number;
  paidCandidatesStruckOut: number;
  elapsedMs: number;
}

export function loadScale(): Promise<ScaleRun | null> {
  return once('scale', async () => {
    const s = await readJson<{
      graph?: { tasks?: number };
      results?: Record<string, number>;
      invariants?: Record<string, number>;
    }>('demo/scale-run.json');
    if (!s?.graph?.tasks || !s.results || !s.invariants) return null;
    return {
      tasks: s.graph.tasks,
      completed: s.results.completed ?? 0,
      workersHired: s.results.workersHired ?? 0,
      handoffs: s.results.handoffs ?? 0,
      outagesScripted: s.results.outagesScripted ?? 0,
      duplicateClaims: s.invariants.duplicateClaims ?? 0,
      orderingViolations: s.invariants.orderingViolations ?? 0,
      budgetOvershoots: s.invariants.budgetOvershoots ?? 0,
      paidCandidatesStruckOut: s.invariants.paidCandidatesStruckOut ?? 0,
      elapsedMs: s.results.elapsedMs ?? 0,
    };
  });
}

export interface Probe {
  at: string;
  models: number;
  passedAll: number;
  partial: number;
  failed: number;
}

export function loadProbe(): Promise<Probe | null> {
  return once('probe', async () => {
    const p = await readJson<{ at?: string; results?: { passed: number; total: number }[] }>(
      'demo/proof/capability-probe.json',
    );
    if (!p?.results?.length) return null;
    const passedAll = p.results.filter((r) => r.passed === r.total).length;
    const failed = p.results.filter((r) => r.passed === 0).length;
    return {
      at: p.at ?? '',
      models: p.results.length,
      passedAll,
      partial: p.results.length - passedAll - failed,
      failed,
    };
  });
}

export interface RocketRideRun {
  capturedAt: string;
  endpoint: string;
  modelId: string;
  latencyMs: number;
  creditsConsumed: number;
  before: number;
  after: number;
  output: string;
}

export function loadRocketRideRun(): Promise<RocketRideRun | null> {
  return once('rocketride-run', async () => {
    const r = await readJson<{
      capturedAt?: string;
      endpoint?: string;
      run?: { modelId?: string; latencyMs?: number; creditsConsumed?: number; workerOutput?: string };
      before?: { credits?: number };
      after?: { credits?: number };
    }>('demo/evidence/rocketride-run.json');
    if (!r?.run || typeof r.before?.credits !== 'number' || typeof r.after?.credits !== 'number') {
      return null;
    }
    return {
      capturedAt: r.capturedAt ?? '',
      endpoint: r.endpoint ?? '',
      modelId: r.run.modelId ?? '',
      latencyMs: r.run.latencyMs ?? 0,
      creditsConsumed:
        r.run.creditsConsumed ?? Number((r.before.credits - r.after.credits).toFixed(1)),
      before: r.before.credits,
      after: r.after.credits,
      output: r.run.workerOutput ?? '',
    };
  });
}

export interface PoolSweep {
  sweptAt: string;
  allowlist: number;
  listed: number;
  answered: number;
}

export function loadPoolSweep(): Promise<PoolSweep | null> {
  return once('pool-sweep', async () => {
    const s = await readJson<{
      sweptAt?: string;
      allowlist?: string[];
      upstreams?: Record<string, { listed?: number; answered?: number }>;
    }>('demo/evidence/pool-sweep.json');
    if (!s?.allowlist?.length) return null;
    const ups = Object.values(s.upstreams ?? {});
    return {
      sweptAt: s.sweptAt ?? '',
      allowlist: s.allowlist.length,
      listed: ups.reduce((n, u) => n + (u.listed ?? 0), 0),
      answered: ups.reduce((n, u) => n + (u.answered ?? 0), 0),
    };
  });
}

/**
 * The number of test cases, counted from the test files rather than typed into
 * the copy, so the figure cannot drift from the suite. It counts `it(` and
 * `test(` at the start of a line, which is how every case in tests/ is written.
 */
export function countTests(): Promise<number | null> {
  return once('tests', async () => {
    try {
      const dir = path.resolve('tests');
      const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.test.ts'));
      let n = 0;
      for (const f of files) {
        const src = await fs.readFile(path.join(dir, f), 'utf8');
        n += (src.match(/^\s*(?:it|test)\(/gm) ?? []).length;
      }
      return n > 0 ? n : null;
    } catch {
      return null;
    }
  });
}
