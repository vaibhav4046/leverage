import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.js';

test('slugify lower-cases and hyphenates', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
});

test('slugify strips punctuation and collapses runs of separators', () => {
  assert.equal(slugify('  Hello,   World! 2026 '), 'hello-world-2026');
  assert.equal(slugify('a--b__c'), 'a-b-c');
});

test('slugify refuses an input that leaves nothing', () => {
  assert.throws(() => slugify('!!!'), /empty/);
});
