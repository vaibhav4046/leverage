import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A permanently public, OpenAI-compatible endpoint for RocketRide workers.
 *
 * RocketRide executes workers in its own cloud, so it cannot reach a model router
 * bound to `127.0.0.1`. Every previous answer to that was a tunnel, and every
 * tunnel died: quick tunnels get a fresh hostname on each start, expire with their
 * parent process, and Cloudflare throttles how many an account-less client may
 * create. The cloud path kept becoming load-bearing and then quietly stopping.
 *
 * This removes the tunnel from the architecture. The Leverage deployment is already
 * public and permanent, so the endpoint lives here:
 *
 *   https://<deployment>/api/v1/pool/v1/chat/completions
 *
 * Point `OMNIROUTE_BASE_URL` at `https://<deployment>/api/v1/pool` and the address
 * never changes again.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not invent a model. With no upstream configured it returns 503 and
 *     says so, rather than serving a canned completion that would make the
 *     evidence a lie.
 *   - It does not accept an upstream from the request. The target is server
 *     configuration only, because a proxy that forwards wherever the caller asks
 *     is an open relay and an SSRF gadget.
 */

const UPSTREAM = process.env.POOL_UPSTREAM_URL;
const UPSTREAM_KEY = process.env.POOL_UPSTREAM_KEY;

/** Only the OpenAI surface a worker actually uses. */
const ALLOWED = new Set(['v1/chat/completions', 'v1/models', 'v1/completions']);

function unconfigured() {
  return NextResponse.json(
    {
      error: 'pool upstream not configured',
      detail:
        'This endpoint forwards to an OpenAI-compatible provider set by POOL_UPSTREAM_URL ' +
        'and POOL_UPSTREAM_KEY. Neither is set on this deployment, so there is nothing to ' +
        'forward to. It returns this rather than a fabricated completion.',
      configure:
        'vercel env add POOL_UPSTREAM_URL production && vercel env add POOL_UPSTREAM_KEY production',
    },
    { status: 503 },
  );
}

async function forward(req: NextRequest, path: string[], method: 'GET' | 'POST') {
  if (!UPSTREAM || !UPSTREAM_KEY) return unconfigured();

  const suffix = path.join('/');
  if (!ALLOWED.has(suffix)) {
    return NextResponse.json({ error: `unsupported path: ${suffix}` }, { status: 404 });
  }

  let body: string | undefined;
  if (method === 'POST') {
    const raw = await req.text();
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // RocketRide's component does not ask for a stream, but several
      // OpenAI-compatible routers default to server-sent events anyway, and the
      // component then reports the SSE frames as a provider error. Forcing the
      // flag off is what makes the worker's output parseable.
      parsed.stream = false;
      body = JSON.stringify(parsed);
    } catch {
      return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 });
    }
  }

  const target = `${UPSTREAM.replace(/\/$/, '')}/${suffix}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(target, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${UPSTREAM_KEY}`,
      },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    // The upstream's own failure, reported as a failure. A worker that receives a
    // plausible-looking success here would put a false result into a ProofPack.
    return NextResponse.json(
      { error: 'upstream unreachable', detail: (err as Error).message },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'GET');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'POST');
}
