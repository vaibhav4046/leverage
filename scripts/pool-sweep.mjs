/**
 * Which pool models actually answer, right now.
 *
 * A provider's model list is a catalog, not a promise. NVIDIA lists 81 ids and
 * three of the first four tried came back `Function ... Not Found`; OpenRouter's
 * free tier rate-limits per model. The only honest allowlist is one where every
 * id was asked for a completion and gave one. This asks each candidate for one
 * word, records status and latency, reads whatever quota the upstream exposes,
 * writes it all to demo/evidence/pool-sweep.json, and prints the POOL_MODELS
 * line to set.
 *
 *   POOL_UPSTREAMS=... POOL_KEY_OPENROUTER=... POOL_KEY_NVIDIA=... node scripts/pool-sweep.mjs
 *
 * Same configuration shape as the hosted route. Keys are read from the
 * environment and never printed. On OpenRouter only `:free` ids are swept, so the
 * sweep cannot spend money; other upstreams are assumed free-tier for the key in
 * use, which is what NVIDIA's developer keys are.
 */
import fs from 'node:fs';

const OUT = 'demo/evidence/pool-sweep.json';
const TIMEOUT_MS = 30_000;
const RETRY_429_AFTER_MS = 20_000;
const PROMPT = 'Reply with exactly: READY';
const FREE_ONLY = { openrouter: (id) => id.endsWith(':free') };
// OpenRouter's free tier allows 20 requests a minute; NVIDIA tolerates a few in flight.
const PACE = { openrouter: { concurrency: 1, gapMs: 3500 }, default: { concurrency: 3, gapMs: 300 } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function upstreams() {
  return (process.env.POOL_UPSTREAMS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf('=');
      const name = entry.slice(0, eq).trim();
      const base = entry.slice(eq + 1).trim().replace(/\/$/, '');
      const key = process.env[`POOL_KEY_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
      if (!name || !base || !key) throw new Error(`upstream "${name || entry}" needs a base URL and a POOL_KEY_ variable`);
      return { name, base, key };
    });
}

async function withTimeout(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function ask(u, id) {
  const t0 = Date.now();
  const full = `${u.name}/${id}`;
  try {
    const res = await withTimeout(`${u.base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${u.key}` },
      body: JSON.stringify({ model: id, messages: [{ role: 'user', content: PROMPT }], max_tokens: 16, stream: false }),
    });
    const text = await res.text();
    let content = null;
    let detail = text.slice(0, 100);
    try {
      const j = JSON.parse(text);
      content = j.choices?.[0]?.message?.content ?? null;
      detail = j.error?.message ?? j.detail ?? (typeof j.error === 'string' ? j.error : detail);
    } catch {
      // not JSON; the raw prefix is the detail
    }
    const ok = res.ok && typeof content === 'string' && content.trim().length > 0;
    return { id: full, status: res.status, ms: Date.now() - t0, ok, sample: String(ok ? content : detail).slice(0, 100) };
  } catch (err) {
    return { id: full, status: 0, ms: Date.now() - t0, ok: false, sample: err.name === 'AbortError' ? 'timeout' : err.message };
  }
}

/** OpenRouter exposes the key's own limits; NVIDIA exposes nothing comparable. */
async function quota(u) {
  try {
    const res = await withTimeout(`${u.base}/v1/auth/key`, { headers: { authorization: `Bearer ${u.key}` } });
    if (!res.ok) return null;
    const d = (await res.json()).data ?? {};
    return { limit: d.limit ?? null, usage: d.usage ?? null, isFreeTier: d.is_free_tier ?? null, rateLimit: d.rate_limit ?? null };
  } catch {
    return null;
  }
}

async function sweepUpstream(u) {
  const res = await withTimeout(`${u.base}/v1/models`, { headers: { authorization: `Bearer ${u.key}` } });
  if (!res.ok) throw new Error(`${u.name}: /v1/models answered ${res.status}`);
  const listed = (await res.json()).data.map((m) => String(m.id));
  const guard = FREE_ONLY[u.name];
  const candidates = guard ? listed.filter(guard) : listed;
  const pace = PACE[u.name] ?? PACE.default;
  const results = [];
  let next = 0;
  async function worker() {
    while (next < candidates.length) {
      const id = candidates[next++];
      let r = await ask(u, id);
      if (r.status === 429) {
        await sleep(RETRY_429_AFTER_MS);
        r = { ...(await ask(u, id)), retried: true };
      }
      results.push(r);
      process.stdout.write(`${r.ok ? 'ok ' : '   '} ${String(r.status).padStart(3)} ${String(r.ms).padStart(6)}ms  ${r.id}\n`);
      await sleep(pace.gapMs);
    }
  }
  await Promise.all(Array.from({ length: pace.concurrency }, worker));
  results.sort((a, b) => a.id.localeCompare(b.id));
  return {
    base: u.base,
    quota: await quota(u),
    listed: listed.length,
    swept: candidates.length,
    answered: results.filter((r) => r.ok).length,
    results,
  };
}

async function main() {
  const ups = upstreams();
  if (ups.length === 0) throw new Error('POOL_UPSTREAMS is empty');
  const report = { sweptAt: new Date().toISOString(), prompt: PROMPT, upstreams: {} };
  const swept = await Promise.all(ups.map(async (u) => [u.name, await sweepUpstream(u)]));
  for (const [name, s] of swept) report.upstreams[name] = s;
  fs.mkdirSync('demo/evidence', { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  const working = swept.flatMap(([, s]) => s.results.filter((r) => r.ok).map((r) => r.id));
  console.log('\nsummary');
  for (const [name, s] of swept) {
    const q = s.quota ? `  quota usage ${s.quota.usage} / limit ${s.quota.limit ?? 'none'}` : '  quota: not exposed';
    console.log(`  ${name.padEnd(12)} listed ${s.listed}  swept ${s.swept}  answered ${s.answered}${q}`);
  }
  console.log(`\nwritten ${OUT}\nPOOL_MODELS=${working.join(',')}`);
}

main().catch((err) => {
  console.error(`pool-sweep failed: ${err.message}`);
  process.exit(1);
});
