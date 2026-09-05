import test from 'node:test';
import assert from 'node:assert/strict';
import { countWords, topWords } from '../src/wordcount.js';

test('countWords counts whitespace-separated words', () => {
  assert.equal(countWords('one two  three'), 3);
  assert.equal(countWords('   '), 0);
});

test('topWords returns the most frequent words, lower-cased, ties broken alphabetically', () => {
  assert.deepEqual(topWords('b a B c a b', 2), [['b', 3], ['a', 2]]);
  assert.deepEqual(topWords('x y', 5), [['x', 1], ['y', 1]]);
});
