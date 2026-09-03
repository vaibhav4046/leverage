import { NextResponse, type NextRequest } from 'next/server';
import { hostChannel } from '@/providers/host';
import { requireIdentity, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

/**
 * The MCP host bridge.
 *
 * Leverage's control plane does not speak MCP, and MCP sampling can only be
 * initiated by the server process that holds the protocol connection. So the MCP
 * server acts as a worker on this queue: it registers, claims parked requests,
 * performs `sampling/createMessage` against its host, and posts the answer back.
 *
 * Three verbs on one route rather than three routes, because they are one protocol
 * and splitting them would let a future change implement half of it.
 *
 *   POST { op: 'register', ... }  -> session id
 *   POST { op: 'claim', sessionId } -> next request or null
 *   POST { op: 'result', id, text } -> ack
 */
export async function POST(req: NextRequest) {
  try {
    await requireIdentity(req);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body must be JSON' }, { status: 400 });
  }

  switch (body.op) {
    case 'register': {
      const hostName = str(body.hostName);
      if (!hostName) return NextResponse.json({ error: 'hostName required' }, { status: 400 });

      const session = hostChannel.register({
        id: str(body.sessionId) || `hs_${Math.random().toString(36).slice(2, 10)}`,
        hostName,
        hostVersion: str(body.hostVersion) || undefined,
        models: Array.isArray(body.models)
          ? body.models.filter((m): m is string => typeof m === 'string').slice(0, 12)
          : [],
        supportsSampling: body.supportsSampling === true,
      });

      return NextResponse.json({
        sessionId: session.id,
        // Told plainly, because a host that connected without sampling is a common
        // and confusing state: it looks connected but can never take work.
        accepted: session.supportsSampling,
        note: session.supportsSampling
          ? 'Host seat registered. Leverage can now hire your own model with no API key.'
          : 'Host connected but did not offer the sampling capability, so it cannot take work.',
      });
    }

    case 'claim': {
      const sessionId = str(body.sessionId);
      if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
      if (!hostChannel.heartbeat(sessionId)) {
        return NextResponse.json({ error: 'unknown session — re-register' }, { status: 409 });
      }
      return NextResponse.json({ request: hostChannel.claim(sessionId) });
    }

    case 'result': {
      const id = str(body.id);
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

      const delivered =
        typeof body.error === 'string'
          ? hostChannel.fulfil(id, { error: body.error })
          : hostChannel.fulfil(id, {
              text: str(body.text),
              model: str(body.model) || undefined,
              stopReason: str(body.stopReason) || undefined,
            });

      // Not an error: the control plane may have already timed the request out.
      return NextResponse.json({ delivered });
    }

    case 'disconnect': {
      hostChannel.disconnect(str(body.sessionId));
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `unknown op: ${String(body.op)}` }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireIdentity(req);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  return NextResponse.json({
    ...hostChannel.stats(),
    sessions: hostChannel.activeSessions().map((s) => ({
      hostName: s.hostName,
      hostVersion: s.hostVersion,
      supportsSampling: s.supportsSampling,
      models: s.models,
    })),
  });
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
