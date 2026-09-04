import { execSync } from 'node:child_process';

/**
 * Free a TCP port before binding it.
 *
 * Killing by process name does not work reliably on Windows, and the failure is
 * invisible rather than loud: a stale listener keeps `127.0.0.1:<port>` while the
 * new process binds `0.0.0.0`, both show up in netstat, both look healthy, and
 * every localhost connection quietly goes to the old code. That is how a zombie
 * proxy made a working tunnel look broken for most of an afternoon.
 *
 * So kill by the thing that actually conflicts, which is the port.
 *
 * Returns the pids it killed, so a caller can say what it did rather than
 * silently reaping other people's processes.
 */
export function freePort(port) {
  const killed = [];

  if (process.platform === 'win32') {
    let out = '';
    try {
      out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    } catch {
      return killed;
    }

    for (const line of out.split(/\r?\n/)) {
      if (!/LISTENING/.test(line)) continue;
      // Match the local address column exactly: ":20129 " and not ":201290".
      if (!new RegExp(`:${port}\\s`).test(line)) continue;

      const pid = line.trim().split(/\s+/).pop();
      if (!pid || pid === '0' || pid === String(process.pid)) continue;

      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        killed.push(pid);
      } catch {
        // Already gone, or not ours to kill. Either way the port may now be free.
      }
    }
    return killed;
  }

  try {
    execSync(`fuser -k ${port}/tcp`, { stdio: 'ignore' });
    killed.push('unknown');
  } catch {
    // Nothing listening is the normal case.
  }
  return killed;
}
