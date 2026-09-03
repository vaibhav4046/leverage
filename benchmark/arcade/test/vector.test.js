import test from 'node:test';
import assert from 'node:assert/strict';
import { add, scale, sub, length, normalize, limit } from '../src/vector.js';

test('add and sub combine components', () => {
  assert.deepEqual(add({ x: 1, y: 2 }, { x: 3, y: 4 }), { x: 4, y: 6 });
  assert.deepEqual(sub({ x: 5, y: 5 }, { x: 1, y: 2 }), { x: 4, y: 3 });
});

test('scale multiplies both components', () => {
  assert.deepEqual(scale({ x: 2, y: -3 }, 2), { x: 4, y: -6 });
  assert.deepEqual(scale({ x: 2, y: 4 }, 0), { x: 0, y: 0 });
});

test('length is euclidean', () => {
  assert.equal(length({ x: 3, y: 4 }), 5);
  assert.equal(length({ x: 0, y: 0 }), 0);
});

test('normalize returns a unit vector and never divides by zero', () => {
  const n = normalize({ x: 0, y: 7 });
  assert.equal(Math.round(length(n) * 1000) / 1000, 1);
  assert.deepEqual(normalize({ x: 0, y: 0 }), { x: 0, y: 0 });
});

test('limit caps magnitude but leaves shorter vectors alone', () => {
  assert.equal(Math.round(length(limit({ x: 30, y: 40 }, 10)) * 1000) / 1000, 10);
  assert.deepEqual(limit({ x: 1, y: 0 }, 10), { x: 1, y: 0 });
});
