import type { MissionTask } from '../core/types';
import { defaultChecksFor } from '../core/mission';

/**
 * The fixture's plan is committed rather than produced by a planner model.
 *
 * A benchmark whose task graph changes between runs measures the planner, not the
 * workforce. Arbitrary missions go through `parseTaskPlan` with a real planner —
 * this path exists so the benchmark is reproducible.
 */
export function buildFixturePlan(missionId: string): MissionTask[] {
  const now = new Date().toISOString();
  const test = (file: string) => ({
    testCommand: ['node', '--test', `test/${file}`],
    testLabel: `test/${file}`,
  });

  const mk = (
    id: string,
    title: string,
    description: string,
    file: string,
    testFile: string,
    deps: string[],
    acceptance: string[],
  ): MissionTask => ({
    id,
    missionId,
    title,
    description,
    category: id === 'index' ? 'integration' : 'backend',
    dependencies: deps,
    requiredCapabilities: [
      { capability: 'code', weight: 1 },
      { capability: 'backend', weight: 0.8 },
      { capability: 'reasoning', weight: 0.6 },
    ],
    risk: 'medium',
    qualityTarget: 0.95,
    budgetUsd: 0,
    fileScope: [`src/${file}`],
    referenceFiles: [`test/${testFile}`],
    verification: {
      checks: defaultChecksFor({ category: 'backend', fileScope: [`src/${file}`] }, test(testFile)),
      acceptance,
    },
    state: 'PENDING',
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return [
    mk(
      'money',
      'Implement money helpers',
      'Create src/money.js as an ES module exporting toCents(str), formatCents(int) and allocate(cents, n). ' +
        'toCents parses a non-negative decimal money string to integer cents and throws on anything else. ' +
        'formatCents renders integer cents as a two-decimal string. ' +
        'allocate distributes cents across n recipients so the parts sum exactly to the input, ' +
        'giving any remainder to the earliest recipients first.',
      'money.js',
      'money.test.js',
      [],
      ['node --test test/money.test.js exits 0'],
    ),
    mk(
      'validate',
      'Implement receipt validation',
      'Create src/validate.js as an ES module exporting validateReceipt(receipt) and a ValidationError class ' +
        'that extends Error. validateReceipt returns { totalCents, people } where people are trimmed strings. ' +
        'It throws ValidationError when total is missing or unparseable, when people is empty, or when people ' +
        'contains duplicates after trimming. Import toCents from ./money.js.',
      'validate.js',
      'validate.test.js',
      [],
      ['node --test test/validate.test.js exits 0'],
    ),
    mk(
      'split',
      'Implement the split calculation',
      'Create src/split.js as an ES module exporting splitReceipt(receipt). It validates via ' +
        'validateReceipt from ./validate.js, allocates with allocate from ./money.js, and returns ' +
        '{ shares: [{ person, amount }] } where amount is a formatted two-decimal string. ' +
        'Validation errors propagate.',
      'split.js',
      'split.test.js',
      ['money', 'validate'],
      ['node --test test/split.test.js exits 0'],
    ),
    mk(
      'index',
      'Implement the request handler',
      'Create src/index.js as an ES module exporting handleSplitRequest(body). On success return ' +
        '{ status: 200, body: <split result> }. On any validation failure return { status: 400, body: { error } } ' +
        'where error is a string. It must not throw on a null body and must never include a stack trace ' +
        'in the response body.',
      'index.js',
      'index.test.js',
      ['split'],
      ['node --test test/index.test.js exits 0', 'no stack traces are returned to callers'],
    ),
  ];
}
