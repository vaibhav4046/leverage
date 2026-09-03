import test from 'node:test';
import assert from 'node:assert/strict';
import { gravityAt, integrate, circlesOverlap, wrap } from '../src/physics.js';

test('gravity points from a body toward the well and weakens with distance', () => {
  const near = gravityAt({ x: 10, y: 0 }, { x: 0, y: 0 }, 100);
  const far = gravityAt({ x: 100, y: 0 }, { x: 0, y: 0 }, 100);
  assert.ok(near.x < 0, 'pulls back toward the well');
  assert.ok(Math.abs(near.x) > Math.abs(far.x), 'weaker further away');
});

test('gravity never returns infinity at the centre', () => {
  const g = gravityAt({ x: 0, y: 0 }, { x: 0, y: 0 }, 100);
  assert.ok(Number.isFinite(g.x) && Number.isFinite(g.y));
});

test('integrate advances position by velocity and velocity by acceleration', () => {
  const body = { pos: { x: 0, y: 0 }, vel: { x: 1, y: 0 } };
  const out = integrate(body, { x: 0, y: 2 }, 1);
  assert.deepEqual(out.vel, { x: 1, y: 2 });
  assert.deepEqual(out.pos, { x: 1, y: 2 });
});

test('integrate does not mutate its input', () => {
  const body = { pos: { x: 0, y: 0 }, vel: { x: 1, y: 1 } };
  integrate(body, { x: 5, y: 5 }, 1);
  assert.deepEqual(body.pos, { x: 0, y: 0 });
  assert.deepEqual(body.vel, { x: 1, y: 1 });
});

test('circlesOverlap is true only when they actually touch', () => {
  assert.equal(circlesOverlap({ x: 0, y: 0 }, 5, { x: 8, y: 0 }, 5), true);
  assert.equal(circlesOverlap({ x: 0, y: 0 }, 5, { x: 20, y: 0 }, 5), false);
});

test('wrap moves a point across the opposite edge', () => {
  assert.deepEqual(wrap({ x: -5, y: 50 }, 100, 100), { x: 95, y: 50 });
  assert.deepEqual(wrap({ x: 105, y: 50 }, 100, 100), { x: 5, y: 50 });
  assert.deepEqual(wrap({ x: 50, y: 50 }, 100, 100), { x: 50, y: 50 });
});
