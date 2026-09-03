import type { NextRequest } from 'next/server';
import { getMission } from '@/server/missions';
import { requireIdentity } from '@/auth/identity';
import type { MissionEvent } from '@/core/types';

export const dynamic = 'force-dynamic';

/**
 * Server-sent mission events.
 *
 * Resumable by design: the client sends `Last-Event-ID` (or `?after=`) and gets only
 * what it missed, so a dropped connection leaves no hole in the timeline. Events are
 * redacted where they are written to the log, not here, so every consumer of the log
 * inherits the same guarantee.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ missionId: string }> }) {
  let identity;
  try {
    identity = await requireIdentity(req);
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  const { missionId } = await ctx.params;
  const state = getMission(missionId, identity.workspaceId);
  if (!state) return new Response('mission not found', { status: 404 });

  const lastId = req.headers.get('last-event-id') ?? req.nextUrl.searchParams.get('after') ?? '0';
  const after = Number.parseInt(lastId, 10) || 0;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: MissionEvent) => {
        try {
          controller.enqueue(
            encoder.encode(
              `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
          );
        } catch {
          // Client vanished mid-write; the abort handler does the cleanup.
        }
      };

      for (const event of state.events.since(after)) send(event);
      unsubscribe = state.events.subscribe(send);

      // Stops proxies closing an idle stream while a long worker is thinking.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          /* closing */
        }
      }, 15_000);

      req.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
