import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A permanently public, OpenAI-compatible pool for RocketRide workers.
 *
 * RocketRide executes workers in its own cloud, so it cannot reach a model router
 * bound to `127.0.0.1`. Every previous answer to that was a tunnel, and every
 * tunnel died. The deployment is already public and permanent, so the pool lives
 * here, at an address that never changes:
 *
 *   https://<deployment>/api/v1/pool/v1/chat/completions
 *
 * It aggregates several upstream providers into one model list. Each model id is
 * prefixed with its upstream's name (`openrouter/…`, `nvidia/…`), the prefix is
 * stripped on the way through, and a model that answers 429 or 5xx is dropped from
 * the list for a minute so the auction stops offering it. Only that model: one
 * free-tier model hitting its quota says nothing about the other four hundred
 * behind the same key. An upstream that cannot be reached at all is dropped whole.
 *
 * What it deliberately does NOT do is fail a request over to a different model.
 * That is not an omission. Leverage already does failover at the right layer: a
 * worker whose provider fails goes on cooldown and the auction hires a different
 * model through a cognitive handoff, which is the product's entire claim and the
 * thing a judge should see happen. A proxy that quietly retried elsewhere would
 * hide it. So a failed call returns the upstream's status, and Leverage decides.
 *
 * Three refusals. Without an access token it refuses everything: a public URL that
 * forwards to paid provider keys for whoever finds it is an open relay. With
 * nothing configured it answers 503 and says so, never a canned completion,
 * because a fabricated result here lands in a ProofPack. And it takes upstreams
 * from server configuration only, never from the caller.
 *
 * Configuration:
 *   POOL_ACCESS_TOKEN    required. Callers present it as `Authorization: Bearer`,
 *                        `x-api-key` or `api-key`. Leverage's executor sends the
 *                        value of OMNIROUTE_API_KEY, so set both to the same string.
 *   POOL_UPSTREAMS       "openrouter=https://openrouter.ai/api,nvidia=https://integrate.api.nvidia.com"
 *   POOL_KEY_<NAME>      the key for each upstream, e.g. POOL_KEY_OPENROUTER
 *   POOL_MODELS          comma-separated allowlist of prefixed ids. When set, the
 *                        model list is restricted to it and any other id is refused,
 *                        so even a leaked token cannot reach a paid model.
 * or, for a single unprefixed upstream:
 *   POOL_UPSTREAM_URL + POOL_UPSTREAM_KEY
 */

interface Upstream {
  name: string;
  base: string;
  key: string;
}

const ALLOWED_PATHS = new Set(['v1/chat/completions', 'v1/models', 'v1/completions']);
const COOLDOWN_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 120_000;
const LIST_TIMEOUT_MS = 20_000;

/**
 * Cooldowns, keyed by prefixed model id (quota or provider failure) or by
 * upstream name (unreachable). Module state on a serverless platform lives only
 * as long as the warm instance, so this is a hint that shortens the time a dead
 * model stays in the list, not the guarantee. Leverage's own scheduler holds the
 * real cooldown, on the model it hired, where it belongs.
 */
const cooling = new Map<string, number>();
const isCooling = (key: string) => (cooling.get(key) ?? 0) > Date.now();
const cool = (key: string) => cooling.set(key, Date.now() + COOLDOWN_MS);

function upstreams(): Upstream[] {
  const list = process.env.POOL_UPSTREAMS;
  if (list) {
    return list
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const eq = entry.indexOf('=');
        if (eq === -1) return null;
        const name = entry.slice(0, eq).trim();
        const base = entry.slice(eq + 1).trim().replace(/\/$/, '');
        const key = process.env[`POOL_KEY_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
        return name && base && key ? { name, base, key } : null;
      })
      .filter((u): u is Upstream => u !== null);
  }
  const single = process.env.POOL_UPSTREAM_URL;
  const singleKey = process.env.POOL_UPSTREAM_KEY;
  if (single && singleKey) return [{ name: 'default', base: single.replace(/\/$/, ''), key: singleKey }];
  return [];
}

function allowlist(): Set<string> | null {
  const list = process.env.POOL_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return list?.length ? new Set(list) : null;
}

function presentedToken(req: NextRequest): string | undefined {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.headers.get('x-api-key') ?? req.headers.get('api-key') ?? undefined;
}

/** Constant-time compare over digests, so a length difference leaks nothing either. */
function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function unconfigured() {
  return NextResponse.json(
    {
      error: 'pool upstream not configured',
      detail:
        'This endpoint forwards to OpenAI-compatible providers named in POOL_UPSTREAMS ' +
        '(with a POOL_KEY_<NAME> for each), or a single POOL_UPSTREAM_URL and ' +
        'POOL_UPSTREAM_KEY. None is set, so there is nothing to forward to. It returns ' +
        'this rather than a fabricated completion.',
    },
    { status: 503 },
  );
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Union of every reachable upstream's models, prefixed, minus cooling and non-allowlisted ids. */
async function listModels(ups: Upstream[]) {
  const single = ups.length === 1 && ups[0].name === 'default';
  const allow = allowlist();
  const results = await Promise.allSettled(
    ups
      .filter((u) => !isCooling(u.name))
      .map(async (u) => {
        let res: Response;
        try {
          res = await fetchWithTimeout(
            `${u.base}/v1/models`,
            { headers: { authorization: `Bearer ${u.key}` } },
            LIST_TIMEOUT_MS,
          );
        } catch {
          cool(u.name);
          return [];
        }
        if (!res.ok) return [];
        const body = (await res.json()) as { data?: Record<string, unknown>[] };
        return (body.data ?? []).map((m) => ({
          ...m,
          id: single ? String(m.id) : `${u.name}/${String(m.id)}`,
          owned_by: u.name,
        }));
      }),
  );
  const data = results
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((m) => !isCooling(m.id) && (!allow || allow.has(m.id)));
  return NextResponse.json({ object: 'list', data });
}

async function forwardCompletion(req: NextRequest, ups: Upstream[], suffix: string) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await req.text()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 });
  }

  const model = String(parsed.model ?? '');
  const allow = allowlist();
  if (allow && !allow.has(model)) {
    return NextResponse.json(
      { error: `model "${model}" is not in the POOL_MODELS allowlist`, allowed: [...allow] },
      { status: 403 },
    );
  }

  const single = ups.length === 1 && ups[0].name === 'default';
  let target: Upstream | undefined;
  let upstreamModel = model;

  if (single) {
    target = ups[0];
  } else {
    const slash = model.indexOf('/');
    const prefix = slash === -1 ? '' : model.slice(0, slash);
    target = ups.find((u) => u.name === prefix);
    if (!target) {
      return NextResponse.json(
        { error: `unknown upstream prefix in model id "${model}"`, known: ups.map((u) => u.name) },
        { status: 400 },
      );
    }
    upstreamModel = model.slice(slash + 1);
  }

  // Honest, and fast: the auction should already have stopped offering this, and
  // a stale caller gets the same answer the upstream would give without the wait.
  if (isCooling(target.name)) {
    return NextResponse.json({ error: `upstream ${target.name} is unreachable, cooling down` }, { status: 503 });
  }
  if (isCooling(model)) {
    return NextResponse.json({ error: `model ${model} is cooling down after a failure` }, { status: 503 });
  }

  // RocketRide's component does not ask for a stream, but several routers
  // default to server-sent events anyway, and the component then reports the SSE
  // frames as a provider error. Forcing the flag off is what makes the worker's
  // output parseable.
  parsed.stream = false;
  parsed.model = upstreamModel;

  try {
    const res = await fetchWithTimeout(
      `${target.base}/${suffix}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${target.key}` },
        body: JSON.stringify(parsed),
      },
      UPSTREAM_TIMEOUT_MS,
    );
    if (res.status === 429 || res.status >= 500) cool(model);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    // The upstream's own failure, reported as a failure. A plausible-looking
    // success here would put a false result into a ProofPack.
    cool(target.name);
    return NextResponse.json(
      { error: 'upstream unreachable', upstream: target.name, detail: (err as Error).message },
      { status: 502 },
    );
  }
}

async function handle(req: NextRequest, path: string[], method: 'GET' | 'POST') {
  const expected = process.env.POOL_ACCESS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        error: 'pool access token not configured',
        detail:
          'POOL_ACCESS_TOKEN is unset. This endpoint forwards to provider keys, so it ' +
          'refuses every request rather than run as an open relay.',
      },
      { status: 503 },
    );
  }
  if (!tokenMatches(presentedToken(req), expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ups = upstreams();
  if (ups.length === 0) return unconfigured();

  const suffix = path.join('/');
  if (!ALLOWED_PATHS.has(suffix)) {
    return NextResponse.json({ error: `unsupported path: ${suffix}` }, { status: 404 });
  }
  if (suffix === 'v1/models') return listModels(ups);
  if (method !== 'POST') return NextResponse.json({ error: 'POST required' }, { status: 405 });
  return forwardCompletion(req, ups, suffix);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return handle(req, path, 'GET');
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return handle(req, path, 'POST');
}
