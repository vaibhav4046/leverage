import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import { cancelMission, createMission, getExecutor, getMission, startMission } from '@/server/missions';
import { snapshotMission } from '@/core/mission';
import type { MissionEvent } from '@/core/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * A real mission, run right now, inside this deployment, streamed to the caller.
 *
 * The public site is read-only everywhere else because execution needs a
 * writable repository and a model pool. Both exist here now: the fixture is
 * copied into the function's temp directory, workers are hired from the hosted
 * pool and executed as RocketRide pipelines, and the fixture's own tests verify
 * every result. The whole run lives inside this one request, so nothing depends
 * on which instance serves the next page. When it finishes, the caller receives
 * the complete snapshot, the same shape every recorded mission has.
 *
 * What a visitor cannot do: change the goal (no text of theirs reaches a model),
 * run two at once on an instance, run again within ten minutes, or run at all
 * once the RocketRide balance is below the floor. Closing the tab cancels the
 * mission, so an abandoned run stops spending. A wall clock cancels anything
 * still going at four and a half minutes, under the platform's own limit.
 *
 * Switched on per deployment with LEVERAGE_LIVE_RUN=1; without it, 503.
 */
const LIVE_WORKSPACE = 'ws_live';
const WALL_CLOCK_MS = 270_000;
const COOLDOWN_MS = 10 * 60_000;
const CREDIT_FLOOR = 1000;
const GOAL =
  'Finish the forge-app receipt splitting library so the whole existing test suite passes. ' +
  'Do not modify any file under test/. Budget: $0. Quality: production.';

const store = globalThis as unknown as {
  __leverageLive?: { running: boolean; lastByIp: Map<string, number> };
};
const live = (store.__leverageLive ??= { running: false, lastByIp: new Map() });

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  if (process.env.LEVERAGE_LIVE_RUN !== '1') {
    return NextResponse.json({ error: 'Live runs are switched off on this deployment.' }, { status: 503 });
  }
  if (live.running) {
    return NextResponse.json(
      { error: 'A live run is already in progress here. Try again in a minute.' },
      { status: 429 },
    );
  }
  const ip = clientIp(req);
  const sinceLast = Date.now() - (live.lastByIp.get(ip) ?? 0);
  if (sinceLast < COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: 'One live run per visitor every ten minutes.',
        retryAfterSeconds: Math.ceil((COOLDOWN_MS - sinceLast) / 1000),
      },
      { status: 429 },
    );
  }
  const before = await getExecutor().credits();
  if (!before || before.balance < CREDIT_FLOOR) {
    return NextResponse.json(
      { error: 'The live demo has used its RocketRide budget for now.', balance: before?.balance ?? null },
      { status: 503 },
    );
  }

  live.running = true;
  live.lastByIp.set(ip, Date.now());

  const work = path.join(os.tmpdir(), `lvr-live-${Math.random().toString(36).slice(2, 10)}`);
  let missionId: string;
  try {
    await fs.cp(path.resolve('benchmark/forge-app'), work, { recursive: true });
    const created = await createMission({
      goal: GOAL,
      workspaceId: LIVE_WORKSPACE,
      userId: 'visitor',
      budgetMaxUsd: 0,
      qualityTarget: 0.95,
      privacy: 'cloud-allowed',
      maxWorkers: 2,
      repositoryRoot: work,
    });
    missionId = created.mission.id;
  } catch (err) {
    live.running = false;
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    return NextResponse.json({ error: `Could not prepare the workspace: ${(err as Error).message}` }, { status: 500 });
  }

  const state = getMission(missionId, LIVE_WORKSPACE);
  if (!state) {
    live.running = false;
    return NextResponse.json({ error: 'mission vanished before it started' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* the client is gone; the abort handler cancels the mission */
        }
      };
      const unsubscribe = state.events.subscribe((e: MissionEvent) => send('mission', e));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          /* closing */
        }
      }, 15_000);
      const wallClock = setTimeout(() => {
        send('live.timeout', { afterMs: WALL_CLOCK_MS });
        cancelMission(missionId, LIVE_WORKSPACE);
      }, WALL_CLOCK_MS);
      req.signal.addEventListener('abort', () => cancelMission(missionId, LIVE_WORKSPACE));

      send('live.started', {
        missionId,
        creditsBefore: before.balance,
        startedAt: new Date().toISOString(),
        workspace: 'a fresh copy of benchmark/forge-app in this function',
      });

      try {
        const started = await startMission(missionId, LIVE_WORKSPACE);
        if (!started.started) {
          send('live.error', { message: started.reason ?? 'could not start' });
        } else {
          while (!TERMINAL.has(state.status)) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        const after = await getExecutor().credits();
        send('live.finished', {
          snapshot: snapshotMission(state),
          creditsBefore: before.balance,
          creditsAfter: after?.balance ?? null,
        });
      } catch (err) {
        send('live.error', { message: (err as Error).message });
      } finally {
        clearTimeout(wallClock);
        clearInterval(heartbeat);
        unsubscribe();
        live.running = false;
        await fs.rm(work, { recursive: true, force: true }).catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      cancelMission(missionId, LIVE_WORKSPACE);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
