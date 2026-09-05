/**
 * Bring up the local workforce, and say exactly what came up.
 *
 * Two fresh missions failed during the judging pass for one reason: the local
 * runtime and the model router were both down, and nothing said so until the
 * workers started returning empty output. "Clone it and run it" is only honest if
 * the dependencies come up with the app, and if their absence is reported as an
 * absence rather than discovered as a failure ten minutes later.
 *
 * This starts what is missing, waits for each piece to actually answer, and prints
 * the model count each contributes. It exits non-zero if the minimum workforce is
 * not reachable, so a judge who runs it gets a verdict, not a hope.
 *
 *   npm run stack:up
 *
 * It never prints a credential and never writes one. The RocketRide cloud path is
 * reported, not started: it needs a publicly reachable pool, and the deployment
 * hosts one at /api/v1/pool. Point OMNIROUTE_BASE_URL at it and OMNIROUTE_API_KEY
 * at its access token (see .env.example).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const OLLAMA = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const ROUTER = 'http://127.0.0.1:20128';
const PROXY = 'http://127.0.0.1:20129';
const WIN = process.platform === 'win32';

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;

async function probe(url, timeoutMs = 4000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Start a process that outlives this script.
 *
 * On Windows a node spawn with `detached` and `shell: true` is not that: it
 * leaves a cmd.exe wrapper that exits and takes the real process with it, so
 * both the runtime and the router "started" and were gone before the first
 * probe. Start-Process is what actually detaches here; it is the mechanism that
 * worked, repeatedly, when everything else silently did not. It also avoids
 * shell-concatenated arguments, which node warns about for a reason.
 */
function launch(cmd, args) {
  if (WIN) {
    const quote = (a) => `'${String(a).replace(/'/g, "''")}'`;
    const argList = args.length ? `-ArgumentList ${args.map(quote).join(',')}` : '';
    spawn(
      'powershell.exe',
      ['-NoProfile', '-Command', `Start-Process -FilePath ${quote(cmd)} ${argList} -WindowStyle Hidden`],
      { stdio: 'ignore', windowsHide: true },
    ).unref();
    return;
  }
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Is anything bound on the port at all?
 *
 * An HTTP probe cannot tell "nothing there" from "there, but every request hangs".
 * Those are different verdicts: the first means start it, the second means a
 * process is stuck and waiting longer will not help. The router does the second
 * when its upstream OAuth tokens have expired and it blocks on refreshing them,
 * which is exactly how it sat bound-and-silent on 20128 for five minutes.
 */
function tcpOpen(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

async function waitFor(name, url, pick, opts = {}) {
  const { attempts = 20, intervalMs = 4000 } = opts;
  for (let i = 1; i <= attempts; i++) {
    const body = await probe(url);
    const count = body ? pick(body) : 0;
    if (count > 0) return count;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return 0;
}

async function main() {
  console.log('Leverage local stack\n');

  // ------------------------------------------------------------------ ollama
  let ollamaModels = (await probe(`${OLLAMA}/api/tags`))?.models?.length ?? 0;
  if (ollamaModels === 0) {
    // A bound port with no answer yet is a process still coming up. Spawning a
    // second one onto it just leaves a zombie that loses the bind and lingers.
    const bound = await tcpOpen(11434);
    process.stdout.write(bound ? 'ollama      waiting…  ' : 'ollama      starting… ');
    if (!bound) launch('ollama', ['serve']);
    ollamaModels = await waitFor('ollama', `${OLLAMA}/api/tags`, (b) => b.models?.length ?? 0);
  }
  console.log(
    ollamaModels > 0
      ? `ollama      ${ok('up')}    ${ollamaModels} local models`
      : `ollama      ${warn('absent')}  no local models (install: https://ollama.com)`,
  );

  // ------------------------------------------------------------------ router
  let routerModels = (await probe(`${ROUTER}/v1/models`))?.data?.length ?? 0;
  let routerState = routerModels > 0 ? 'serving' : 'absent';
  if (routerModels === 0) {
    const bound = await tcpOpen(20128);
    process.stdout.write(bound ? 'router      waiting…  ' : 'router      starting… ');
    if (!bound) launch(WIN ? 'cmd.exe' : 'omniroute', WIN ? ['/c', 'omniroute'] : []);
    for (let i = 1; i <= 20 && routerState !== 'serving'; i++) {
      const n = (await probe(`${ROUTER}/v1/models`))?.data?.length ?? 0;
      if (n > 0) {
        routerModels = n;
        routerState = 'serving';
        break;
      }
      routerState = (await tcpOpen(20128)) ? 'listening' : 'absent';
      // Bound but silent for ~25s is stuck, not slow. Stop wasting the wait.
      if (routerState === 'listening' && i >= 6) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  console.log(
    routerState === 'serving'
      ? `router      ${ok('up')}    ${routerModels} free routes`
      : routerState === 'listening'
        ? `router      ${warn('stuck')}  bound on 20128 but answers nothing. Usually expired upstream credentials in the router; find it with: netstat -ano | findstr :20128`
        : `router      ${warn('absent')}  no free routes (optional: omniroute)`,
  );

  // ------------------------------------------------------------------- proxy
  // Only meaningful if the router is up: it normalises the router's streaming
  // default into the single-JSON contract RocketRide's component can parse.
  let proxyModels = 0;
  if (routerModels > 0) {
    proxyModels = (await probe(`${PROXY}/v1/models`))?.data?.length ?? 0;
    if (proxyModels === 0) {
      const bound = await tcpOpen(20129);
      process.stdout.write(bound ? 'proxy       waiting…  ' : 'proxy       starting… ');
      if (!bound) launch(process.execPath, [path.resolve('scripts/pool-proxy.mjs')]);
      proxyModels = await waitFor('proxy', `${PROXY}/v1/models`, (b) => b.data?.length ?? 0, {
        attempts: 8,
        intervalMs: 2000,
      });
    }
    console.log(
      proxyModels > 0
        ? `proxy       ${ok('up')}    ${PROXY}`
        : `proxy       ${bad('down')}  RocketRide workers would get SSE frames, not JSON`,
    );
  }

  // --------------------------------------------------------------- rocketride
  const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  const hasKey = /^ROCKETRIDE_APIKEY=.+/m.test(env);
  const pool = env.match(/^OMNIROUTE_BASE_URL=(.+)$/m)?.[1]?.trim() ?? '';
  const poolKey = env.match(/^OMNIROUTE_API_KEY=(.+)$/m)?.[1]?.trim() ?? '';

  // Probe the pool, never pattern-match it. A stale tunnel hostname still sitting
  // in .env.local looks exactly like a public URL and answers nothing; reporting
  // it "ready" is the one lie this script exists to prevent. The hosted pool is
  // token-gated, so the probe carries the same credential the executor sends.
  let poolState = 'none';
  let poolModels = 0;
  if (/^https?:\/\//.test(pool)) {
    const headers = poolKey ? { authorization: `Bearer ${poolKey}` } : {};
    poolModels = (await probe(`${pool}/v1/models`, 8000, headers))?.data?.length ?? 0;
    const local = /127\.0\.0\.1|localhost/.test(pool);
    poolState = poolModels === 0 ? 'unreachable' : local ? 'local' : 'public';
  }
  console.log(
    !hasKey
      ? `rocketride  ${warn('no key')}  cloud path off; local and agent-cli workers still run`
      : poolState === 'public'
        ? `rocketride  ${ok('ready')}  key present, hosted pool answers with ${poolModels} models`
        : poolState === 'local'
          ? `rocketride  ${warn('local')}  key present, pool answers but only on localhost; cloud workers cannot reach it`
          : `rocketride  ${warn('pool down')}  key present, but OMNIROUTE_BASE_URL does not answer; cloud workers would fail. Hosted pool: OMNIROUTE_BASE_URL=https://<deployment>/api/v1/pool plus its OMNIROUTE_API_KEY. Local-only run: OMNIROUTE_BASE_URL=${PROXY}`,
  );

  // ------------------------------------------------------------------ verdict
  // A hosted pool counts only when it is not the local router seen twice.
  const hostedModels = poolState === 'public' ? poolModels : 0;
  const workforce = ollamaModels + routerModels + hostedModels;
  console.log();
  if (workforce === 0) {
    console.log(bad('No workforce reachable. A mission would have nobody to hire.'));
    console.log('Install Ollama and pull one model, or start the router, then run this again.');
    process.exit(1);
  }
  const sources = [
    ollamaModels > 0 ? `${ollamaModels} local` : '',
    routerModels > 0 ? `${routerModels} free via router` : '',
    hostedModels > 0 ? `${hostedModels} hosted, via RocketRide` : '',
  ].filter(Boolean);
  console.log(ok(`Workforce ready: ${workforce} models (${sources.join(' + ')}).`));
  console.log('Next: npm run dev, then start a mission from /app/new or through MCP.');
}

main().catch((err) => {
  console.error(bad(`stack-up failed: ${err.message}`));
  process.exit(1);
});
