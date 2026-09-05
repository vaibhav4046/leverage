import fs from 'node:fs/promises';
import path from 'node:path';
import { parseTaskPlan, PlanRejectedError, type PlannedTaskShape } from '../core/compiler';
import { defaultChecksFor } from '../core/mission';
import type { MissionState } from '../core/scheduler';
import { isCommandAllowed } from '../core/policy';
import type {
  CostClass,
  MissionSpec,
  MissionTask,
  ModelDescriptor,
  PrivacyMode,
  TaskCategory,
  VerificationCheckSpec,
} from '../core/types';
import type { ProviderRegistry } from '../providers/registry';

/**
 * The planner: a model turns a goal and a repository into a task graph.
 *
 * Until this file existed, every mission ran the committed fixture plan and the
 * goal text only set policy, while the docs said arbitrary goals went through
 * `parseTaskPlan`. They do now, and only through it: the model proposes, the
 * compiler validates (cycles, dangling edges, escaping paths, task limits, a
 * check per task), and a plan that fails validation fails the mission with the
 * reason. Nothing falls back to the fixture silently.
 *
 * The planner reads the repository's file list, package scripts, README head and
 * the head of its test files, because the tests are the specification. It may
 * name a verify command per task, but only in the handful of shapes listed in
 * `acceptedCommand`: the goal text reaches the planner, so a command it proposes
 * is as trusted as the goal, which is not at all.
 */

const MAX_FILES = 240;
const MAX_DEPTH = 5;
const MAX_TEST_EXCERPTS = 4;
const EXCERPT_LINES = 60;
const EXCERPT_BUDGET_CHARS = 7000;
/** Hosted routes are tried first; a hosted route out of quota costs seconds, so a few are affordable before local takes it. */
const MAX_HOSTED_ATTEMPTS = 10;
const MAX_LOCAL_ATTEMPTS = 2;
const ATTEMPT_TIMEOUT_MS = 120_000;
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.leverage-state', '.turbo', '.cache']);
const CATEGORIES: TaskCategory[] = ['architecture', 'backend', 'frontend', 'tests', 'security', 'docs', 'research', 'integration', 'verification'];
/** A path the plan may name: relative, inside the repository, not a flag. */
const REL_PATH = /^(?!-)(?!.*(?:^|\/)\.\.(?:\/|$))[\w@./*-]+$/;

export interface RepositoryDigest {
  files: string[];
  /** Files that look like tests: under test/, tests/, __tests__/ or spec/, or *.test.* / *.spec.*. */
  testFiles: string[];
  scripts: Record<string, string> | null;
  /** Whether vitest is a dependency, which decides the runner a plan may name. */
  vitest: boolean;
  readme: string;
  testExcerpts: { path: string; head: string }[];
  truncated: boolean;
}

const TEST_PATH = /(^|\/)(test|tests|__tests__|spec)\//;
const TEST_NAME = /\.(test|spec)\.[cm]?[jt]sx?$/;
export const isTestFile = (rel: string) => TEST_PATH.test(rel) || TEST_NAME.test(rel);

export interface PlannerRecord {
  modelKey: string;
  displayName: string;
  costClass: CostClass;
  durationMs: number;
  taskCount: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Candidates that were asked before this one and did not answer. */
  skipped: string[];
}

export async function digestRepository(root: string): Promise<RepositoryDigest> {
  const files: string[] = [];
  let truncated = false;
  const walk = async (dir: string, depth: number) => {
    if (files.length >= MAX_FILES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
      const rel = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), depth + 1);
      else if (entry.isFile()) {
        if (files.length >= MAX_FILES) {
          truncated = true;
          return;
        }
        files.push(rel);
      }
    }
  };
  await walk(root, 0);

  let scripts: Record<string, string> | null = null;
  let vitest = false;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    scripts = pkg.scripts ?? null;
    vitest = Boolean(pkg.devDependencies?.vitest ?? pkg.dependencies?.vitest);
  } catch {
    /* not a node project, or no package.json */
  }

  let readme = '';
  for (const name of ['README.md', 'readme.md', 'README']) {
    try {
      readme = (await fs.readFile(path.join(root, name), 'utf8')).split('\n').slice(0, 40).join('\n');
      break;
    } catch {
      /* try the next spelling */
    }
  }

  // The tests are the specification; the planner needs to see what they import
  // and assert, not guess it from file names.
  const testFiles = files.filter(isTestFile);
  const testExcerpts: { path: string; head: string }[] = [];
  let budget = EXCERPT_BUDGET_CHARS;
  for (const rel of testFiles) {
    if (testExcerpts.length >= MAX_TEST_EXCERPTS || budget <= 0) break;
    try {
      const head = (await fs.readFile(path.join(root, rel), 'utf8')).split('\n').slice(0, EXCERPT_LINES).join('\n').slice(0, budget);
      budget -= head.length;
      testExcerpts.push({ path: rel, head });
    } catch {
      /* unreadable; skip it */
    }
  }
  return { files, testFiles, scripts, vitest, readme, testExcerpts, truncated };
}

/**
 * Who plans, in order of preference. Paid models never. Under local-only, only a
 * local runtime. Otherwise the fastest eligible class goes first: a plan is one
 * long structured answer, and on a laptop GPU a small local model takes minutes
 * over it and often breaks the JSON, while a free hosted route answers in
 * seconds. For this one job local is the fallback, not the preference.
 */
export function rankPlanners(registry: ProviderRegistry, privacy: PrivacyMode = 'prefer-local'): ModelDescriptor[] {
  const classRank: Record<CostClass, number> =
    privacy === 'local-only' ? { local: 3, host: 0, free: 0, paid: 0 } : { free: 3, host: 2, local: 1, paid: 0 };
  const usable = registry
    .allModels()
    .filter((m) => m.costClass !== 'paid' && (privacy !== 'local-only' || m.costClass === 'local'))
    // A provider whose last probe failed keeps its catalogue and stays a
    // candidate: one timed-out probe is not proof a planning call will fail,
    // and the attempt loop moves on in seconds if it does.
    .filter((m) => registry.healthFor(m.providerId).status !== 'AUTH_ERROR');
  const rank = (m: ModelDescriptor) =>
    classRank[m.costClass] * 1_000_000 +
    (m.capabilities.includes('reasoning') ? 100_000 : 0) +
    (m.capabilities.includes('code') ? 50_000 : 0) +
    Math.min(m.contextTokens, 32_000);
  return usable.sort((a, b) => rank(b) - rank(a));
}

export function choosePlanner(registry: ProviderRegistry, privacy: PrivacyMode = 'prefer-local'): ModelDescriptor | null {
  return rankPlanners(registry, privacy)[0] ?? null;
}

function systemPrompt(): string {
  return [
    'You are the planner for Leverage, an intelligence resource manager. You turn a goal and a',
    'repository into a small graph of implementation tasks for other models to execute.',
    'Answer with ONE JSON object and nothing else. Shape:',
    '{"tasks":[{"id":"short-slug","title":"...","description":"exact, testable instructions for a worker",',
    `"category":"one of ${CATEGORIES.join('|')}","dependencies":["ids of tasks that must pass first"],`,
    '"fileScope":["relative paths the worker may create or edit"],',
    '"referenceFiles":["relative paths the worker must read but never edit, such as tests"],',
    '"verify":{"argv":["node","--test","test/x.test.js"],"label":"what passing means"},',
    '"acceptance":["plain statements a reviewer can check"]}]}',
    'Rules: at most 8 tasks; every task creates or edits at least one file named in fileScope and',
    'lists the test files that prove it done in referenceFiles; do not add a task whose only job is',
    'to run the whole suite, because every task already runs its own tests; every task has exactly',
    'one verify command that exits 0 only when the task is done, in one of these shapes and no other:',
    '["node","--test","<test file>", ...], ["npm","test"], ["npm","run","<script named in package.json>"],',
    '["npx","vitest","run","<test file>", ...]; paths are relative to the repository root and never',
    'leave it; tests are referenceFiles, never fileScope; independent tasks must not depend on each',
    'other so they can run in parallel; do not invent files that the goal does not need.',
  ].join(' ');
}

function userPrompt(goal: string, digest: RepositoryDigest): string {
  const scripts = digest.scripts ? JSON.stringify(digest.scripts) : 'none';
  const excerpts = digest.testExcerpts.map((t) => `--- ${t.path} (head)\n${t.head}`).join('\n\n');
  return [
    `GOAL:\n${goal}`,
    `REPOSITORY FILES (${digest.files.length}${digest.truncated ? ', truncated' : ''}):\n${digest.files.join('\n')}`,
    `PACKAGE SCRIPTS: ${scripts}`,
    digest.readme ? `README (head):\n${digest.readme}` : 'README: none',
    excerpts ? `TEST FILES:\n${excerpts}` : 'TEST FILES: none found',
    'Return the JSON object now.',
  ].join('\n\n');
}

/**
 * The only command shapes a plan may run. The binary allowlist alone would let a
 * plan say `node -e <anything>`; a test runner over named files, or a script the
 * repository itself defines, is the whole vocabulary.
 */
export function acceptedCommand(argv: string[], scripts: Record<string, string> | null): boolean {
  if (!isCommandAllowed(argv)) return false;
  const [bin, ...rest] = argv;
  if (bin === 'node') return rest[0] === '--test' && rest.length >= 2 && rest.slice(1).every((p) => REL_PATH.test(p));
  if (bin === 'npm' || bin === 'pnpm') {
    if (rest.length === 1 && rest[0] === 'test') return true;
    return rest.length === 2 && rest[0] === 'run' && typeof scripts?.[rest[1]] === 'string';
  }
  if (bin === 'npx') return rest[0] === 'vitest' && rest[1] === 'run' && rest.slice(2).every((p) => REL_PATH.test(p));
  return false;
}

/** The test runner a repository uses, for the checks this file infers. */
function runnerFor(digest: RepositoryDigest, files: string[]): string[] {
  return digest.vitest ? ['npx', 'vitest', 'run', ...files] : ['node', '--test', ...files];
}

const CODE_CATEGORIES = new Set<TaskCategory>(['architecture', 'backend', 'frontend', 'tests', 'security', 'integration', 'verification']);

/**
 * The checks one planned task carries. Existence of every file in scope, plus
 * exactly one test command, chosen in this order: the accepted command the plan
 * named; the test files the plan listed as references; the repository's test
 * files whose name matches a file in scope. A code task in a repository that has
 * tests but none that reach it is refused: a file that merely exists is not a
 * task done, and the vacuous pass that would follow is exactly the failure this
 * planner exists to prevent.
 */
export function checksForTask(task: PlannedTaskShape, digest: RepositoryDigest): VerificationCheckSpec[] {
  const existence = defaultChecksFor({ category: task.category, fileScope: task.fileScope });
  const suite = (argv: string[], label: string): VerificationCheckSpec => ({
    id: 'suite',
    label,
    kind: 'command',
    argv,
    weight: 4,
    timeoutMs: 120_000,
  });

  const verify = task.verify as { argv?: unknown; label?: unknown } | undefined;
  const named = Array.isArray(verify?.argv) ? verify!.argv.map(String) : null;
  // A worker allowed to edit package.json could rewrite the very script that
  // verifies it; such a task is held to a runner over named test files only.
  const editsManifest = task.fileScope.some((f) => /(^|\/)package\.json$/.test(f));
  const scriptBacked = (argv: string[]) => argv[0] === 'npm' || argv[0] === 'pnpm';
  if (named && acceptedCommand(named, digest.scripts) && !(editsManifest && scriptBacked(named))) {
    return [...existence, suite(named, typeof verify?.label === 'string' ? verify.label : named.join(' '))];
  }

  const referenced = task.referenceFiles.filter((f) => isTestFile(f) && digest.files.includes(f));
  if (referenced.length > 0) {
    return [...existence, suite(runnerFor(digest, referenced), `${referenced.join(', ')} pass`)];
  }

  // A test named after a file in scope is that file's test; only code is held to
  // it, since docs/slug.md is not what test/slug.test.js proves.
  const stems = CODE_CATEGORIES.has(task.category)
    ? task.fileScope.map((f) => path.posix.basename(f).replace(/\.[^.]+$/, '').toLowerCase()).filter(Boolean)
    : [];
  const matched = digest.testFiles.filter((t) => {
    const stem = path.posix.basename(t).toLowerCase().replace(/\.(test|spec)\.[cm]?[jt]sx?$/, '').replace(/\.[^.]+$/, '');
    return stems.includes(stem);
  });
  if (matched.length > 0) {
    return [...existence, suite(runnerFor(digest, matched), `${matched.join(', ')} pass`)];
  }

  if (digest.testFiles.length > 0 && CODE_CATEGORIES.has(task.category)) {
    throw new PlanRejectedError(
      `task "${task.id}" names no test that proves it done; the repository has tests (${digest.testFiles.slice(0, 3).join(', ')}${digest.testFiles.length > 3 ? ', ...' : ''}), so list the ones it must satisfy in referenceFiles`,
      '',
    );
  }
  return existence;
}

/** The record every caller writes into the mission log once a plan is accepted. */
export function announcePlan(state: MissionState, planner: PlannerRecord, tasks: MissionTask[], planText: string): void {
  state.events.emit(
    'mission.compiled',
    `Planned by ${planner.displayName}: ${planner.taskCount} tasks in ${(planner.durationMs / 1000).toFixed(1)}s`,
    {
      data: {
        planner,
        // What each task is held to, so the record shows the plan was test-backed.
        checks: tasks.map((t) => ({
          taskId: t.id,
          suite: t.verification.checks.find((c) => c.kind === 'command')?.label ?? 'existence only',
        })),
        // The proposal as the model wrote it, so the plan is evidence, not a claim.
        planText: planText.slice(0, 8000),
      },
    },
  );
}

export async function planWithModel(opts: {
  spec: MissionSpec;
  goal: string;
  repositoryRoot: string;
  registry: ProviderRegistry;
  signal?: AbortSignal;
}): Promise<{ tasks: MissionTask[]; planner: PlannerRecord; planText: string }> {
  const ranked = rankPlanners(opts.registry, opts.spec.privacy.mode);
  const candidates = [
    ...ranked.filter((m) => m.costClass !== 'local').slice(0, MAX_HOSTED_ATTEMPTS),
    ...ranked.filter((m) => m.costClass === 'local').slice(0, MAX_LOCAL_ATTEMPTS),
  ];
  if (candidates.length === 0) {
    throw new PlanRejectedError(
      opts.spec.privacy.mode === 'local-only'
        ? 'no local model is reachable to plan with under local-only privacy'
        : 'no local or free model is reachable to plan with',
      '',
    );
  }

  const digest = await digestRepository(opts.repositoryRoot);
  const request = {
    system: systemPrompt(),
    user: userPrompt(opts.goal, digest),
    maxOutputTokens: 2000,
    temperature: 0.2,
    timeoutMs: ATTEMPT_TIMEOUT_MS,
  };
  const skipped: string[] = [];

  for (const model of candidates) {
    const adapter = opts.registry.adapterFor(model);
    if (!adapter) continue;
    const started = Date.now();
    const timeout = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS + 5_000);
    let text: string | null = null;
    let usage: { promptTokens?: number; completionTokens?: number } = {};
    // A hosted route that is momentarily full (503, "ResourceExhausted") usually
    // answers a few seconds later; a route out of quota for the day (429) does
    // not. Give the first kind two more chances before moving on.
    for (let attempt = 0; attempt < 3 && text === null; attempt++) {
      try {
        const response = await adapter.invoke(model, request, opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout);
        text = response.text;
        usage = { promptTokens: response.promptTokens, completionTokens: response.completionTokens };
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        const message = (err as Error).message;
        const transient = /HTTP 503|ResourceExhausted|HTTP 502|HTTP 504/.test(message);
        if (transient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }
        // A route that is rate limited or down is not a rejected plan; the next
        // candidate gets the same question.
        skipped.push(`${model.displayName}: ${message.slice(0, 140)}`);
        break;
      }
    }
    if (text === null) continue;

    let tasks: MissionTask[];
    try {
      tasks = parseTaskPlan(text, opts.spec, (task) => checksForTask(task, digest));
    } catch (err) {
      if (err instanceof PlanRejectedError) {
        throw new PlanRejectedError(`${model.displayName} proposed a plan the compiler rejected: ${err.message}`, text);
      }
      throw err;
    }
    return {
      tasks,
      planText: text,
      planner: {
        modelKey: model.key,
        displayName: model.displayName,
        costClass: model.costClass,
        durationMs: Date.now() - started,
        taskCount: tasks.length,
        ...usage,
        skipped,
      },
    };
  }
  throw new PlanRejectedError(`no planner answered: ${skipped.join('; ')}`, '');
}
