import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, fire } from '../src/game.js';

test('a new game starts on wave 1 with a live ship and no bullets', () => {
  const g = createGame(800, 600, 42);
  assert.equal(g.wave, 1);
  assert.equal(g.score, 0);
  assert.equal(g.bullets.length, 0);
  assert.ok(g.enemies.length > 0);
  assert.equal(g.over, false);
});

test('step advances without mutating the game passed in', () => {
  const g = createGame(800, 600, 42);
  const snapshot = JSON.stringify(g);
  step(g, { thrust: 0, turn: 0 }, 1 / 60);
  assert.equal(JSON.stringify(g), snapshot);
});

test('fire adds exactly one bullet travelling away from the ship', () => {
  const g = fire(createGame(800, 600, 42));
  assert.equal(g.bullets.length, 1);
  const b = g.bullets[0];
  assert.ok(Math.abs(b.vel.x) + Math.abs(b.vel.y) > 0);
});

test('bullets expire so the array cannot grow without bound', () => {
  let g = fire(createGame(800, 600, 42));
  for (let i = 0; i < 400; i += 1) g = step(g, { thrust: 0, turn: 0 }, 1 / 60);
  assert.equal(g.bullets.length, 0);
});

test('clearing every enemy advances the wave and respawns', () => {
  let g = createGame(800, 600, 42);
  g = { ...g, enemies: [] };
  g = step(g, { thrust: 0, turn: 0 }, 1 / 60);
  assert.equal(g.wave, 2);
  assert.ok(g.enemies.length > 0);
});

test('the score never decreases across a step', () => {
  let g = createGame(800, 600, 42);
  const before = g.score;
  g = step(g, { thrust: 1, turn: 0.5 }, 1 / 60);
  assert.ok(g.score >= before);
});
