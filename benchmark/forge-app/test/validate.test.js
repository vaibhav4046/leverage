import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReceipt, ValidationError } from '../src/validate.js';

test('accepts a well-formed receipt', () => {
  const r = { total: '30.00', people: ['ada', 'grace'] };
  assert.deepEqual(validateReceipt(r), { totalCents: 3000, people: ['ada', 'grace'] });
});

test('rejects a missing total', () => {
  assert.throws(() => validateReceipt({ people: ['ada'] }), ValidationError);
});

test('rejects an empty people list', () => {
  assert.throws(() => validateReceipt({ total: '10.00', people: [] }), ValidationError);
});

test('rejects duplicate people', () => {
  assert.throws(() => validateReceipt({ total: '10.00', people: ['ada', 'ada'] }), ValidationError);
});

test('trims whitespace from names', () => {
  const r = validateReceipt({ total: '10.00', people: ['  ada  ', 'grace'] });
  assert.deepEqual(r.people, ['ada', 'grace']);
});
