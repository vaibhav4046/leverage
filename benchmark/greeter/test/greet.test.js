import test from 'node:test';
import assert from 'node:assert/strict';
import { greet, shout } from '../src/greet.js';

test('greet says hello with the name', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
});

test('greet trims and rejects empty names', () => {
  assert.equal(greet('  Lin '), 'Hello, Lin!');
  assert.throws(() => greet(''), /name/);
});

test('shout upper-cases and adds an exclamation', () => {
  assert.equal(shout('quiet'), 'QUIET!');
});
