import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, waveSize, spawnWave } from '../src/spawner.js';

test('createRng is deterministic for a given seed', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test('createRng returns values in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 200; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('waveSize grows with the wave number', () => {
  assert.ok(waveSize(5) > waveSize(1));
  assert.equal(waveSize(1), 3);
});

test('spawnWave produces the requested count inside the arena', () => {
  const enemies = spawnWave(3, createRng(1), 800, 600);
  assert.equal(enemies.length, waveSize(3));
  for (const e of enemies) {
    assert.ok(e.pos.x >= 0 && e.pos.x <= 800);
    assert.ok(e.pos.y >= 0 && e.pos.y <= 600);
    assert.equal(typeof e.radius, 'number');
    assert.ok(e.radius > 0);
  }
});

test('spawnWave is reproducible from the same seed', () => {
  const a = spawnWave(2, createRng(9), 800, 600);
  const b = spawnWave(2, createRng(9), 800, 600);
  assert.deepEqual(a, b);
});
