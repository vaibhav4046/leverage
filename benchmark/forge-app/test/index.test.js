import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSplitRequest } from '../src/index.js';

test('returns 200 and the split for a valid body', () => {
  const res = handleSplitRequest({ total: '30.00', people: ['ada', 'grace'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.shares.map((s) => s.amount), ['15.00', '15.00']);
});

test('returns 400 with a message for an invalid body', () => {
  const res = handleSplitRequest({ total: 'nope', people: ['ada'] });
  assert.equal(res.status, 400);
  assert.equal(typeof res.body.error, 'string');
});

test('returns 400 rather than throwing on a null body', () => {
  const res = handleSplitRequest(null);
  assert.equal(res.status, 400);
});

test('never leaks a stack trace to the caller', () => {
  const res = handleSplitRequest({ total: '10.00', people: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.stack, undefined);
});
