import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlanRejectedError, type PlannedTaskShape } from '../src/core/compiler';
import { acceptedCommand, checksForTask, type RepositoryDigest } from '../src/server/planner';

/**
 * The planner's check rules. A plan-named command runs only in the accepted
 * shapes; a task without one is held to the tests that reach it; a code task in
 * a tested repository that no test reaches is refused rather than passed on
 * existence alone.
 */

const digest = (over: Partial<RepositoryDigest> = {}): RepositoryDigest => ({
  files: ['package.json', 'src/greet.js', 'test/greet.test.js', 'test/slug.test.js', 'README.md'],
  testFiles: ['test/greet.test.js', 'test/slug.test.js'],
  scripts: { test: 'node --test test/*.test.js', lint: 'eslint .' },
  vitest: false,
  readme: '',
  testExcerpts: [],
  truncated: false,
  ...over,
});

const task = (over: Partial<PlannedTaskShape> = {}): PlannedTaskShape => ({
  id: 'create-slug',
  category: 'backend',
  fileScope: ['src/slug.js'],
  referenceFiles: [],
  ...over,
});

const suiteOf = (checks: ReturnType<typeof checksForTask>) => checks.find((c) => c.kind === 'command');

describe('acceptedCommand', () => {
  const scripts = { test: 'node --test', build: 'tsc' };

  it('accepts a test runner over named files and the repository scripts', () => {
    expect(acceptedCommand(['node', '--test', 'test/slug.test.js'], scripts)).toBe(true);
    expect(acceptedCommand(['node', '--test', 'test/*.test.js'], scripts)).toBe(true);
    expect(acceptedCommand(['npm', 'test'], scripts)).toBe(true);
    expect(acceptedCommand(['npm', 'run', 'build'], scripts)).toBe(true);
    expect(acceptedCommand(['npx', 'vitest', 'run', 'src/a.test.ts'], scripts)).toBe(true);
  });

  it('refuses anything that is not a test runner over repository paths', () => {
    expect(acceptedCommand(['node', '-e', 'process.exit(0)'], scripts)).toBe(false);
    expect(acceptedCommand(['node', 'scripts/anything.js'], scripts)).toBe(false);
    expect(acceptedCommand(['node', '--test', '../outside.test.js'], scripts)).toBe(false);
    expect(acceptedCommand(['node', '--test', '--require', 'x'], scripts)).toBe(false);
    expect(acceptedCommand(['npm', 'run', 'not-a-script'], scripts)).toBe(false);
    expect(acceptedCommand(['npx', 'some-package'], scripts)).toBe(false);
    expect(acceptedCommand(['bash', '-c', 'true'], scripts)).toBe(false);
    expect(acceptedCommand([], scripts)).toBe(false);
  });
});

describe('checksForTask', () => {
  it('uses the command the plan named when it is an accepted shape', () => {
    const checks = checksForTask(
      task({ verify: { argv: ['node', '--test', 'test/slug.test.js'], label: 'slug tests pass' } }),
      digest(),
    );
    expect(suiteOf(checks)).toMatchObject({ argv: ['node', '--test', 'test/slug.test.js'], label: 'slug tests pass' });
    expect(checks.filter((c) => c.kind === 'file-exists').map((c) => c.path)).toEqual(['src/slug.js']);
  });

  it('drops a named command outside the accepted shapes and falls back to the referenced tests', () => {
    const checks = checksForTask(
      task({ verify: { argv: ['node', '-e', 'process.exit(0)'] }, referenceFiles: ['test/slug.test.js'] }),
      digest(),
    );
    expect(suiteOf(checks)?.argv).toEqual(['node', '--test', 'test/slug.test.js']);
  });

  it('holds a task with no named command to the test files it references', () => {
    const checks = checksForTask(task({ referenceFiles: ['test/slug.test.js', 'README.md'] }), digest());
    expect(suiteOf(checks)?.argv).toEqual(['node', '--test', 'test/slug.test.js']);
  });

  it('finds the test whose name matches the file in scope when nothing is referenced', () => {
    const checks = checksForTask(task(), digest());
    expect(suiteOf(checks)?.argv).toEqual(['node', '--test', 'test/slug.test.js']);
  });

  it('names vitest as the runner when the repository depends on it', () => {
    const checks = checksForTask(task({ referenceFiles: ['test/slug.test.js'] }), digest({ vitest: true }));
    expect(suiteOf(checks)?.argv).toEqual(['npx', 'vitest', 'run', 'test/slug.test.js']);
  });

  it('refuses a code task that no test reaches in a repository that has tests', () => {
    expect(() => checksForTask(task({ id: 'create-util', fileScope: ['src/util.js'] }), digest())).toThrow(PlanRejectedError);
    expect(() => checksForTask(task({ id: 'create-util', fileScope: ['src/util.js'] }), digest())).toThrow(/create-util/);
  });

  it('lets a docs task in a tested repository pass on existence, and any task in an untested one', () => {
    const docs = checksForTask(task({ id: 'write-docs', category: 'docs', fileScope: ['docs/slug.md'] }), digest());
    expect(suiteOf(docs)).toBeUndefined();
    expect(docs).toHaveLength(1);

    const untested = checksForTask(task({ fileScope: ['src/util.js'] }), digest({ testFiles: [], files: ['src/greet.js'] }));
    expect(suiteOf(untested)).toBeUndefined();
    expect(untested.map((c) => c.kind)).toEqual(['file-exists']);
  });
});

describe('failureExcerpt', () => {
  it('quotes the failing test and its assertion instead of the last line of a stack trace', async () => {
    const { failureExcerpt } = await import('../src/core/verify');
    const stdout = [
      'TAP version 13',
      '# Subtest: slugify strips punctuation and collapses runs of separators',
      'not ok 2 - slugify strips punctuation and collapses runs of separators',
      '  ---',
      '  duration_ms: 1.2',
      '  error: |-',
      "    Expected values to be strictly equal:",
      "    actual: 'abc'",
      "    expected: 'a-b-c'",
      '  stack: |-',
      '    at Test.run (node:internal/test_runner/test:1106:25)',
      '  ...',
      '  }',
    ].join('\n');
    const detail = failureExcerpt(stdout, '');
    expect(detail).toContain('not ok 2 - slugify strips punctuation');
    expect(detail).toContain("actual: 'abc'");
    expect(detail).toContain("expected: 'a-b-c'");
    expect(detail).not.toContain('at Test.run');
    expect(detail.endsWith('}')).toBe(false);
  });

  it('falls back to the last line when nothing looks like an assertion', async () => {
    const { failureExcerpt } = await import('../src/core/verify');
    expect(failureExcerpt('building\ndone with code 3', '')).toBe('done with code 3');
  });
});

describe('stripAnsi', () => {
  it('removes reporter colour codes so a proof detail is plain text', async () => {
    const { stripAnsi, failureExcerpt } = await import('../src/core/verify');
    expect(stripAnsi('\u001b[34mℹ duration_ms 404.1\u001b[39m')).toBe('ℹ duration_ms 404.1');
    expect(failureExcerpt('', '\u001b[31mnot ok 1 - x\u001b[39m')).toBe('not ok 1 - x');
  });
});


describe('wholeSuiteCheck', () => {
  const tmp = (pkg: object | null) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lvr-suite-'));
    if (pkg) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
    return dir;
  };

  it('is skipped, not passed, when the repository defines no test script', async () => {
    const { wholeSuiteCheck } = await import('../src/core/verify');
    expect(await wholeSuiteCheck(tmp(null))).toBeNull();
    expect(await wholeSuiteCheck(tmp({ name: 'x', scripts: { build: 'true' } }))).toBeNull();
  });

  it('passes on exit 0 and fails with the reason otherwise', async () => {
    const { wholeSuiteCheck } = await import('../src/core/verify');
    const ok = await wholeSuiteCheck(tmp({ name: 'ok', scripts: { test: 'node -e "console.log(\'all green\')"' } }));
    expect(ok?.status).toBe('pass');
    const bad = await wholeSuiteCheck(
      tmp({ name: 'bad', scripts: { test: 'node -e "console.error(\'not ok 1 - money rounds\'); process.exit(1)"' } }),
    );
    expect(bad?.status).toBe('fail');
    expect(bad?.detail).toContain('not ok 1 - money rounds');
  }, 60_000);
});
