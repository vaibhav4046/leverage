/**
 * The public pool endpoint, as a managed service.
 *
 * RocketRide executes workers in its own cloud, so it cannot reach a model router
 * bound to 127.0.0.1. Something has to put that router on a public address, and
 * for the last pass that something was a `cloudflared` process I started by hand.
 * That is not a fix: quick tunnels get a fresh random hostname every start and die
 * with their parent, so the cloud path silently stopped being load-bearing the
 * moment the shell closed.
 *
 * This makes it a service instead:
 *   - starts the tunnel and waits for the hostname
 *   - writes that hostname into .env.local as OMNIROUTE_BASE_URL, so nothing
 *     downstream has to be told by hand
 *   - re-registers on reconnect, because the hostname changes
 *   - verifies the endpoint actually answers before claiming it is up
 *
 * It does not print the URL to a log a screenshot might capture by accident, and
 * it never writes a credential.
 *
 *   node scripts/pool-tunnel.mjs            # foreground, ctrl-c to stop
 *   node scripts/pool-tunnel.mjs --quiet    # under pm2
 *
 * The permanent version of this is a named Cloudflare tunnel or a hosted router;
 * both need an account, so they are recorded as an operator action rather than
 * done here. See docs/BLOCKERS_REQUIRING_OPERATOR.md.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// The proxy, not the router: what we publish must be the normalised contract.
const LOCAL = process.env.POOL_LOCAL_URL ?? 'http://127.0.0.1:20129';
const ENV_FILE = path.resolve('.env.local');
const QUIET = process.argv.includes('--quiet');

const log = (...args) => {
  if (!QUIET) console.log('[pool-tunnel]', ...args);
};

/** Always printed, even under --quiet: without it a failure is undiagnosable. */
const say = (...args) => console.log('[pool-tunnel]', ...args);

/**
 * Rewrite a single key in .env.local, leaving every other line untouched.
 *
 * Deliberately line-based rather than parse-and-serialise: this file holds
 * credentials, and a round trip through a parser is a good way to reformat or
 * drop one of them.
 */
function setEnvVar(key, value) {
  let lines = [];
  if (fs.existsSync(ENV_FILE)) {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  }
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, lines.filter((l, i) => l !== '' || i < lines.length - 1).join('\n'));
}

async function reachable(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/v1/models`, { signal: ctrl.signal });
    if (!res.ok) return 0;
    const body = await res.json();
    return Array.isArray(body?.data) ? body.data.length : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kill stale tunnels before starting one.
 *
 * Only tunnels. Reaping the upstream's port here killed the proxy this process
 * exists to publish, so the hostname came up with nothing behind it and reported
 * "never began serving" -- a self-inflicted outage that looked exactly like a
 * slow Cloudflare edge. The process that binds a port owns freeing it.
 *
 * Two quick tunnels pointed at the same local port compete, and the loser never
 * begins serving. The symptom is a hostname that is announced and then answers
 * nothing, which reads exactly like a slow edge, so it cost an hour to spot.
 */
function killStaleTunnels() {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
    } else {
      execSync("pkill -f 'cloudflared tunnel'", { stdio: 'ignore' });
    }
    say('cleared a stale tunnel');
  } catch {
    // Nothing to kill is the normal case.
  }
}

/**
 * A named tunnel, when one is configured.
 *
 * This is the version that actually holds. Quick tunnels are rate limited by
 * Cloudflare (after roughly a dozen creations they simply hang at "Requesting new
 * quick Tunnel"), get a new random hostname every start, and carry no uptime
 * guarantee -- Cloudflare says so in the banner. A named tunnel has a stable
 * hostname, so nothing needs re-registering and OMNIROUTE_BASE_URL can just be
 * set once.
 *
 * Set CLOUDFLARE_TUNNEL_TOKEN and POOL_PUBLIC_URL and this path is used instead.
 */
function namedTunnelConfigured() {
  return Boolean(process.env.CLOUDFLARE_TUNNEL_TOKEN && process.env.POOL_PUBLIC_URL);
}

async function runNamedTunnel() {
  const publicUrl = process.env.POOL_PUBLIC_URL.replace(/\/$/, '');
  say('using a named tunnel (stable hostname, no re-registration)');

  const child = spawn(
    process.platform === 'win32' ? 'cloudflared.cmd' : 'cloudflared',
    ['tunnel', 'run', '--token', process.env.CLOUDFLARE_TUNNEL_TOKEN],
    { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
  );
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});

  for (let attempt = 1; attempt <= 20; attempt++) {
    const count = await reachable(publicUrl);
    if (count > 0) {
      setEnvVar('OMNIROUTE_BASE_URL', publicUrl);
      say(`public pool registered via named tunnel, ${count} models`);
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }

  child.on('exit', (code) => {
    console.error(`[pool-tunnel] named tunnel exited with ${code}`);
    process.exit(code ?? 1);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      child.kill();
      process.exit(0);
    });
  }
}

async function main() {
  killStaleTunnels();

  // Wait for the router rather than exiting. Under a supervisor, a script that
  // quits because a dependency is slow is a restart loop wearing a hat.
  let localModels = 0;
  for (let attempt = 1; localModels === 0; attempt++) {
    localModels = await reachable(LOCAL, 6000);
    if (localModels > 0) break;
    if (attempt === 1 || attempt % 12 === 0) {
      log(`waiting for the local router at ${LOCAL} (attempt ${attempt})`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  log(`local router up, ${localModels} models`);

  if (namedTunnelConfigured()) {
    await runNamedTunnel();
    return;
  }

  say('no named tunnel configured; falling back to a quick tunnel');
  say('quick tunnels are rate limited and change hostname on every start');

  const child = spawn(
    process.platform === 'win32' ? 'cloudflared.cmd' : 'cloudflared',
    ['tunnel', '--url', LOCAL, '--no-autoupdate'],
    { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
  );

  let current = null;

  const onChunk = async (buf) => {
    const text = buf.toString();
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!match || match[0] === current) return;

    const candidate = match[0];
    current = candidate;

    // cloudflared announces the hostname exactly once, and the edge takes a few
    // seconds to start serving it. Discarding the hostname on the first failed
    // probe means never seeing it again, which is precisely how this silently
    // published nothing. Retry the same hostname instead.
    let count = 0;
    for (let attempt = 1; attempt <= 10 && count === 0; attempt++) {
      count = await reachable(candidate);
      if (count === 0) await new Promise((r) => setTimeout(r, 3000));
    }

    if (count === 0) {
      say('tunnel hostname never began serving; leaving OMNIROUTE_BASE_URL alone');
      current = null;
      return;
    }

    setEnvVar('OMNIROUTE_BASE_URL', candidate);
    // Host prefix only, never the full URL: this line lands in pm2 logs, and a
    // log is one screenshot away from being public.
    say(`public pool registered (${new URL(candidate).hostname.slice(0, 8)}…), ${count} models`);
    say('OMNIROUTE_BASE_URL updated in .env.local; restart the app to pick it up');
  };

  child.stdout.on('data', onChunk);
  child.stderr.on('data', onChunk);

  child.on('exit', (code) => {
    console.error(`[pool-tunnel] cloudflared exited with ${code}`);
    process.exit(code ?? 1);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      child.kill();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[pool-tunnel]', err.message);
  process.exit(1);
});
