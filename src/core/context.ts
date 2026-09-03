import path from 'node:path';
import fs from 'node:fs/promises';
import type {
  ContextBundle,
  ContextFile,
  FailureType,
  MissionSpec,
  MissionTask,
  ProofPack,
} from './types';
import { estimateTokens } from './tokens';

/**
 * Context compiler.
 *
 * The economic argument for Leverage only works if workers are cheap, and workers
 * are only cheap if they are not handed the whole repository. This builds the
 * smallest bundle that can plausibly complete the task, and records what it left
 * out so the reduction figure is measured rather than asserted.
 *
 * Selection is deterministic — file scope, then dependency outputs, then failure
 * history. No embedding model, no similarity search: for a task graph that already
 * names its own file scope, retrieval would be a slower way to get a worse answer.
 */

export interface CompileContextArgs {
  mission: MissionSpec;
  task: MissionTask;
  /** Proofs from completed dependency tasks. */
  dependencyProofs: { task: MissionTask; proof: ProofPack }[];
  failures: { attempt: number; failureType: FailureType; detail: string }[];
  /** Hard ceiling; files are dropped from the least relevant end to fit. */
  maxTokens: number;
}

const MAX_FILE_BYTES = 60_000;

export async function compileContext(args: CompileContextArgs): Promise<ContextBundle> {
  const { mission, task } = args;
  const root = mission.repository?.root;

  const files: ContextFile[] = [];
  let availableRepoTokens = 0;

  if (root) {
    availableRepoTokens = await estimateRepoTokens(root);

    // Files a completed dependency actually wrote. A worker implementing split.js
    // has to see the real exported signatures of money.js and validate.js, not a
    // one-line summary of them -- guessing an upstream API is the most common way
    // a downstream task fails verification for a reason that is not its fault.
    const dependencyFiles = args.dependencyProofs.flatMap((d) => d.proof.filesChanged);

    const scoped: { rel: string; writable: boolean }[] = [
      ...task.fileScope.map((rel) => ({ rel, writable: true })),
      ...task.referenceFiles.map((rel) => ({ rel, writable: false })),
      ...dependencyFiles
        .filter((rel) => !task.fileScope.includes(rel) && !task.referenceFiles.includes(rel))
        .map((rel) => ({ rel, writable: false })),
    ];

    for (const { rel, writable } of scoped) {
      const abs = safeJoin(root, rel);
      if (!abs) continue;

      try {
        const stat = await fs.stat(abs);
        if (!stat.isFile()) continue;
        if (stat.size > MAX_FILE_BYTES) {
          files.push({
            path: rel,
            reason: writable
              ? 'in task scope (too large to inline; header only)'
              : 'READ-ONLY reference (truncated)',
            content: (await readHead(abs, 2000)) + '\n... [truncated]',
            approxTokens: estimateTokens('x'.repeat(2000)),
          });
          continue;
        }
        const content = await fs.readFile(abs, 'utf8');
        files.push({
          path: rel,
          reason: writable
            ? 'in task scope -- you may write this file'
            : 'READ-ONLY reference -- you must satisfy this, never modify it',
          content,
          approxTokens: estimateTokens(content),
        });
      } catch {
        // A file the task is meant to *create* does not exist yet. Say so
        // explicitly — a worker that does not know this invents a rewrite.
        files.push({
          path: rel,
          reason: writable
            ? 'in task scope -- does not exist yet, you are creating it'
            : 'READ-ONLY reference -- missing',
          content: '',
          approxTokens: 0,
        });
      }
    }
  }

  const dependencyResults = args.dependencyProofs.map(({ task: depTask, proof }) => ({
    taskId: depTask.id,
    title: depTask.title,
    summary:
      `${proof.status} · ${proof.checks.filter((c) => c.status === 'pass').length}/` +
      `${proof.checks.length} checks passed · files: ${proof.filesChanged.join(', ') || 'none'}`,
  }));

  // Trim to budget, dropping the largest low-priority files first. Files the task
  // is creating (empty content) are free and always survive.
  const bundle: ContextBundle = {
    taskSummary: `${task.title}\n\n${task.description}`,
    constraints: [...mission.constraints, ...task.verification.acceptance.map((a) => `Acceptance: ${a}`)],
    files,
    dependencyResults,
    failures: args.failures,
    approximateTokens: 0,
    availableRepoTokens,
  };

  bundle.approximateTokens = totalTokens(bundle);

  while (bundle.approximateTokens > args.maxTokens && bundle.files.length > 0) {
    const largest = bundle.files.reduce((a, b) => (b.approxTokens > a.approxTokens ? b : a));
    if (largest.approxTokens === 0) break;
    bundle.files = bundle.files.map((f) =>
      f === largest
        ? {
            ...f,
            content: `${(f.content ?? '').slice(0, 1500)}\n... [trimmed to fit context budget]`,
            reason: `${f.reason} (trimmed)`,
            approxTokens: estimateTokens('x'.repeat(1500)),
          }
        : f,
    );
    const next = totalTokens(bundle);
    if (next >= bundle.approximateTokens) break; // no progress; stop rather than spin
    bundle.approximateTokens = next;
  }

  return bundle;
}

function totalTokens(b: ContextBundle): number {
  return (
    estimateTokens(b.taskSummary) +
    b.constraints.reduce((s, c) => s + estimateTokens(c), 0) +
    b.files.reduce((s, f) => s + f.approxTokens + estimateTokens(f.path) + 8, 0) +
    b.dependencyResults.reduce((s, d) => s + estimateTokens(d.summary), 0) +
    b.failures.reduce((s, f) => s + estimateTokens(f.detail), 0)
  );
}

/**
 * Reject anything that escapes the mission repository.
 *
 * The file scope comes from a compiled plan, and a plan can be influenced by mission
 * text, so it is untrusted input. `..` and absolute paths are refused rather than
 * normalised.
 */
export function safeJoin(root: string, relative: string): string | null {
  if (path.isAbsolute(relative)) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  const rel = path.relative(resolvedRoot, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

async function readHead(file: string, bytes: number): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.leverage-state']);

/**
 * What the whole repository would have cost to send. This is the denominator of the
 * context-reduction figure, so it is measured by walking the tree rather than
 * assumed.
 */
export async function estimateRepoTokens(root: string): Promise<number> {
  let total = 0;
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx|json|md|css|html|sql|py)$/.test(entry.name)) {
        try {
          const { size } = await fs.stat(full);
          total += Math.ceil(size / 3.6);
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(root, 0);
  return total;
}
