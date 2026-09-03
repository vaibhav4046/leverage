import test from 'node:test';
import assert from 'node:assert/strict';
import { splitReceipt } from '../src/split.js';

test('splits evenly when it divides cleanly', () => {
  const out = splitReceipt({ total: '30.00', people: ['ada', 'grace', 'alan'] });
  assert.deepEqual(out.shares, [
    { person: 'ada', amount: '10.00' },
    { person: 'grace', amount: '10.00' },
    { person: 'alan', amount: '10.00' },
  ]);
});

test('gives the remainder to the earliest people, deterministically', () => {
  const out = splitReceipt({ total: '10.00', people: ['ada', 'grace', 'alan'] });
  assert.deepEqual(out.shares.map((s) => s.amount), ['3.34', '3.33', '3.33']);
});

test('the shares always sum to the total', () => {
  const out = splitReceipt({ total: '99.99', people: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  const sum = out.shares.reduce((acc, s) => acc + Math.round(Number(s.amount) * 100), 0);
  assert.equal(sum, 9999);
});

test('propagates validation failures', () => {
  assert.throws(() => splitReceipt({ total: '10.00', people: [] }));
});
