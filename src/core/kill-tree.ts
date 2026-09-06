import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

/** How long taskkill gets before the direct child is killed without it. */
export const TREE_KILL_BOUND_MS = 8_000;

/**
 * Terminate a child and everything it spawned.
 *
 * On Windows every command Leverage runs goes through cmd.exe, so the process
 * that matters (npm test, an agent CLI, node --test) is a grandchild.
 * `child.kill()` only reaches cmd.exe; the grandchild keeps running, keeps its
 * memory, and on a busy laptop that is enough to push the whole machine into a
 * low-virtual-memory condition that kills the server itself. taskkill /T walks
 * the tree, and it has to run while the parent is alive or the tree is already
 * broken. taskkill can hang when the WMI service is unhealthy, so it gets a
 * bounded lifetime and the direct child is killed afterwards no matter what.
 * Elsewhere SIGKILL on the direct child is enough because the child is the process.
 *
 * Returns a promise that settles when the direct child has been signalled.
 */
export function killTree(child: ChildProcess, boundMs: number = TREE_KILL_BOUND_MS): Promise<'tree' | 'child-only'> {
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    return Promise.resolve('tree');
  }
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve('tree');

  // Absolute path: Node 24 reports a missing executable asynchronously, and a
  // PATH without System32 would otherwise turn the kill into an unhandled error.
  const taskkill = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  const killer = spawn(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });

  return new Promise((resolve) => {
    let done = false;
    const finish = (how: 'tree' | 'child-only') => {
      if (done) return;
      done = true;
      clearTimeout(bound);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolve(how);
    };
    const bound = setTimeout(() => {
      killer.kill('SIGKILL');
      finish('child-only');
    }, boundMs);
    killer.on('error', () => finish('child-only'));
    killer.on('exit', (code) => finish(code === 0 ? 'tree' : 'child-only'));
  });
}
