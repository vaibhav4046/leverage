import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { killTree } from '../src/core/kill-tree';

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(check: () => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return check();
}

describe('killTree', () => {
  it('kills the shell within the bound, and its grandchild when taskkill answers', async (ctx) => {
    const isWindows = process.platform === 'win32';
    const sleeper = 'process.stdout.write(String(process.pid)); setTimeout(() => {}, 60000)';
    const child = isWindows
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'node', '-e', sleeper], { windowsHide: true })
      // Elsewhere Leverage runs the command itself, so the child is the process.
      : spawn('sh', ['-c', `exec node -e '${sleeper}'`]);

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    const grandchildPid = await new Promise<number>((resolve, reject) => {
      child.stdout.once('data', (d) => resolve(Number(String(d).trim())));
      child.once('close', (code) => reject(new Error(`shell exited ${code} before reporting a pid: ${stderr}`)));
    });
    expect(isAlive(grandchildPid)).toBe(true);

    const how = await killTree(child, 3_000);
    // A signal kill leaves exitCode null and sets signalCode.
    expect(await waitUntil(() => child.exitCode !== null || child.signalCode !== null, 3_000)).toBe(true);

    if (how === 'child-only') {
      process.kill(grandchildPid, 'SIGKILL');
      ctx.skip(true, 'taskkill did not answer on this machine, so only the direct child could be verified');
    }
    expect(await waitUntil(() => !isAlive(grandchildPid), 3_000)).toBe(true);
  });
});
