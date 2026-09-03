import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatCents, allocate } from '../src/money.js';

test('toCents converts a decimal string to integer cents', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents('0.05'), 5);
  assert.equal(toCents('100'), 10000);
});

test('toCents rejects values that are not money', () => {
  assert.throws(() => toCents('abc'));
  assert.throws(() => toCents(''));
  assert.throws(() => toCents('-1.00'));
});

test('formatCents renders cents as a two-decimal string', () => {
  assert.equal(formatCents(1234), '12.34');
  assert.equal(formatCents(5), '0.05');
  assert.equal(formatCents(0), '0.00');
});

test('allocate splits cents without losing or inventing a penny', () => {
  assert.deepEqual(allocate(1000, 3), [334, 333, 333]);
  assert.deepEqual(allocate(1, 3), [1, 0, 0]);
  assert.deepEqual(allocate(100, 4), [25, 25, 25, 25]);
  const parts = allocate(9999, 7);
  assert.equal(parts.reduce((a, b) => a + b, 0), 9999);
});
