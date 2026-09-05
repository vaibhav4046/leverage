import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  MissionTask,
  ProofCheck,
  QualityScore,
  VerificationCheckSpec,
} from './types';
import { isCommandAllowed } from './policy';
import { safeJoin } from './context';

/**
 * Verification engine.
 *
 * A task is complete when a compiler, a test runner or the filesystem says so —
 * never because a model reported confidence. Model self-assessment is recorded
 * separately and is deliberately the smallest term in the quality score.
 *
 * Commands are spawned with an argv array and `shell: false`. Mission text is
 * attacker-controlled and must never be concatenated into a shell string.
 */

export interface VerifyResult {
  checks: ProofCheck[];
  passed: boolean;
}

/**
 * The verdict when nothing could be checked.
 *
 * A task with no checks cannot be proven done, so an empty gate fails instead of
 * passing by default. The single synthetic check carries the reason into the
 * proof pack and the timeline, so the failure is legible rather than mysterious.
 */
export function unverifiable(detail: string): VerifyResult {
  return {
    checks: [
      {
        id: 'no-verification',
        label: 'Verification defined',
        status: 'fail',
        detail,
        durationMs: 0,
        weight: 1,
      },
    ],
    passed: false,
  };
}

export async function runVerification(
  task: MissionTask,
  repoRoot: string,
  opts: { signal?: AbortSignal } = {},
): Promise<VerifyResult> {
  if (task.verification.checks.length === 0) {
    return unverifiable('no verification was defined for this task');
  }

  const checks: ProofCheck[] = [];

  for (const spec of task.verification.checks) {
    checks.push(await runCheck(spec, repoRoot, opts.signal));
  }

  return {
    checks,
    passed: checks.every((c) => c.status !== 'fail'),
  };
}

async function runCheck(
  spec: VerificationCheckSpec,
  repoRoot: string,
  signal?: AbortSignal,
): Promise<ProofCheck> {
  const started = Date.now();
  const base = { id: spec.id, label: spec.label, weight: spec.weight };

  try {
    switch (spec.kind) {
      case 'file-exists': {
        const abs = spec.path ? safeJoin(repoRoot, spec.path) : null;
        if (!abs) {
          return { ...base, status: 'fail', detail: `path escapes repository: ${spec.path}`, durationMs: 0 };
        }
        const exists = await fs
          .stat(abs)
          .then((s) => s.isFile())
          .catch(() => false);
        return {
          ...base,
          status: exists ? 'pass' : 'fail',
          detail: exists ? `${spec.path} exists` : `${spec.path} is missing`,
          durationMs: Date.now() - started,
        };
      }

      case 'file-contains': {
        const abs = spec.path ? safeJoin(repoRoot, spec.path) : null;
        if (!abs) {
          return { ...base, status: 'fail', detail: `path escapes repository: ${spec.path}`, durationMs: 0 };
        }
        const content = await fs.readFile(abs, 'utf8').catch(() => null);
        if (content === null) {
          return {
            ...base,
            status: 'fail',
            detail: `${spec.path} is missing`,
            durationMs: Date.now() - started,
          };
        }
        const hit = spec.contains ? content.includes(spec.contains) : false;
        return {
          ...base,
          status: hit ? 'pass' : 'fail',
          detail: hit
            ? `${spec.path} contains expected content`
            : `${spec.path} does not contain ${JSON.stringify(spec.contains)}`,
          durationMs: Date.now() - started,
        };
      }

      case 'command': {
        const argv = spec.argv ?? [];
        if (!isCommandAllowed(argv)) {
          return {
            ...base,
            status: 'fail',
            detail: `command not on the allowlist: ${argv[0] ?? '(empty)'}`,
            durationMs: 0,
          };
        }
        const result = await execArgv(argv, repoRoot, spec.timeoutMs ?? 120_000, signal);
        return {
          ...base,
          status: result.code === 0 ? 'pass' : 'fail',
          detail:
            result.code === 0
              ? lastLine(result.stdout) || `exit 0`
              : `exit ${result.code}: ${failureExcerpt(result.stdout, result.stderr)}`,
          durationMs: Date.now() - started,
        };
      }
    }
  } catch (err) {
    return {
      ...base,
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run an allowlisted command with no shell.
 *
 * On Windows, npm/npx/pnpm are .cmd shims which `spawn` cannot execute without a
 * shell, so those specific binaries are resolved to their .cmd form and invoked
 * via cmd.exe with the argv passed as separate arguments — the arguments are still
 * never concatenated into a command string.
 */
/**
 * The repository's own whole test suite, run once every task has passed.
 *
 * Each task is verified by the tests that reach it, in parallel with its
 * siblings. That proves the parts; it does not prove the whole, because a worker
 * on one task may have broken a file another task's tests cover. So a mission is
 * "verified" only when `npm test` in the repository exits 0 as well. Returns null
 * when the repository defines no test script: there is nothing to run, and the
 * mission record says so rather than pretending.
 */
export async function wholeSuiteCheck(
  repoRoot: string,
  signal?: AbortSignal,
  timeoutMs = 180_000,
): Promise<ProofCheck | null> {
  let scripts: Record<string, string> | undefined;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    scripts = pkg.scripts;
  } catch {
    return null;
  }
  if (typeof scripts?.test !== 'string' || !scripts.test.trim()) return null;

  const started = Date.now();
  const result = await execArgv(['npm', 'test'], repoRoot, timeoutMs, signal);
  return {
    id: 'whole-suite',
    label: 'Whole test suite (npm test)',
    status: result.code === 0 ? 'pass' : 'fail',
    detail: result.code === 0 ? lastLine(result.stdout) || 'exit 0' : `exit ${result.code}: ${failureExcerpt(result.stdout, result.stderr)}`,
    weight: 4,
    durationMs: Date.now() - started,
  };
}

export function execArgv(
  argv: string[],
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const [bin, ...rest] = argv;
    const isWindows = process.platform === 'win32';
    // npm/npx/pnpm and friends are .cmd shims on Windows; CreateProcess cannot run
    // them, which surfaces as a bare EINVAL. Route those through the command
    // interpreter explicitly, still passing arguments as a separate array so no
    // untrusted string is ever concatenated into a command line.
    const needsShim = isWindows && ['npm', 'npx', 'pnpm', 'tsc', 'vitest', 'eslint'].includes(bin);

    const command = needsShim ? (process.env.ComSpec ?? 'cmd.exe') : bin;
    const commandArgs = needsShim ? ['/d', '/s', '/c', `${bin}.cmd`, ...rest] : rest;

    const child = spawn(command, commandArgs, {
      cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ code: 124, stdout, stderr: `${stderr}\ntimed out after ${timeoutMs}ms` });
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      clearTimeout(timer);
      resolve({ code: 130, stdout, stderr: `${stderr}\ncancelled` });
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: 127, stdout, stderr: err.message });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * The lines of a failed run that say what went wrong: the failing test's name and
 * its assertion, not the closing brace of a stack trace. A replacement worker
 * reads this from the checkpoint, so the difference between "exit 1: }" and
 * "expected 'a-b-c', actual 'abc'" is the difference between a handoff that
 * fixes the bug and one that repeats it.
 */
const FAILURE_LINE = /\b(not ok|fail(?:ing|ed|ure)?|error|expected|actual|assert)\b|✖|×|✗/i;
const FAILURE_NOISE = /^\s*at\s|^\s*[{}\]\[],?\s*$|^\s*(operator|generatedMessage|diff|code):/;

/** Colour codes a test reporter may emit even into a pipe; a proof is text, not a terminal. */
const ANSI = /\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (text: string) => text.replace(ANSI, '');

export function failureExcerpt(stdout: string, stderr: string, max = 600): string {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const raw of `${stripAnsi(stdout)}\n${stripAnsi(stderr)}`.split(/\r?\n/)) {
    const line = raw.trim().replace(/^#\s*/, '');
    if (!line || !FAILURE_LINE.test(line) || FAILURE_NOISE.test(line) || seen.has(line)) continue;
    seen.add(line);
    picked.push(line.slice(0, 200));
    if (picked.join(' | ').length > max) break;
  }
  return picked.length ? picked.join(' | ').slice(0, max) : lastLine(stderr || stdout);
}

function lastLine(text: string): string {
  const lines = stripAnsi(text).trim().split(/\r?\n/).filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 300) : '';
}

/**
 * Quality score.
 *
 * Weighted across evidence classes, with deterministic signals dominating. The AI
 * reviewer term is optional and only included when a reviewer actually ran — the
 * weights renormalise over whichever buckets have evidence, so a missing reviewer
 * cannot silently deflate an otherwise-passing score.
 */
export const QUALITY_WEIGHTS = {
  acceptance: 0.4,
  automated: 0.35,
  staticChecks: 0.15,
  aiReview: 0.1,
} as const;

export function computeQualityScore(input: {
  acceptanceMet: number;
  acceptanceTotal: number;
  checks: ProofCheck[];
  staticChecks: ProofCheck[];
  aiReview?: number;
}): QualityScore {
  const acceptance =
    input.acceptanceTotal === 0 ? 1 : input.acceptanceMet / input.acceptanceTotal;
  const automated = weightedPassRate(input.checks);
  const staticChecks = input.staticChecks.length ? weightedPassRate(input.staticChecks) : 1;

  const buckets: [keyof typeof QUALITY_WEIGHTS, number][] = [
    ['acceptance', acceptance],
    ['automated', automated],
    ['staticChecks', staticChecks],
  ];
  if (input.aiReview !== undefined) buckets.push(['aiReview', input.aiReview]);

  const weightSum = buckets.reduce((s, [k]) => s + QUALITY_WEIGHTS[k], 0);
  const total = buckets.reduce((s, [k, v]) => s + QUALITY_WEIGHTS[k] * v, 0) / weightSum;

  return {
    total: round2(total * 100),
    acceptance: round2(acceptance * 100),
    automated: round2(automated * 100),
    staticChecks: round2(staticChecks * 100),
    aiReview: input.aiReview === undefined ? undefined : round2(input.aiReview * 100),
    weights: Object.fromEntries(buckets.map(([k]) => [k, QUALITY_WEIGHTS[k] / weightSum])),
  };
}

function weightedPassRate(checks: ProofCheck[]): number {
  const scored = checks.filter((c) => c.status !== 'skipped');
  if (scored.length === 0) return 1;
  const total = scored.reduce((s, c) => s + c.weight, 0);
  if (total === 0) return 1;
  const passed = scored.filter((c) => c.status === 'pass').reduce((s, c) => s + c.weight, 0);
  return passed / total;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
