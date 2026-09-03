import { add, scale, normalize } from './vector.js';
import { gravityAt, integrate, circlesOverlap, wrap } from './physics.js';
import { createRng, spawnWave, waveSize } from './spawner.js';

const WELL_STRENGTH = 500;
const THRUST = 180;
const TURN_RATE = 4;
const BULLET_SPEED = 240;
const BULLET_TTL = 2;
const BULLET_RADIUS = 3;
const SHIP_RADIUS = 12;
const SCORE_PER_KILL = 10;

function wellPos(width, height) {
  return { x: width / 2, y: height / 2 };
}

function heading(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export function createGame(width, height, seed) {
  return {
    width,
    height,
    seed,
    wave: 1,
    score: 0,
    over: false,
    ship: {
      pos: { x: width / 2, y: height / 2 },
      vel: { x: 0, y: 0 },
      radius: SHIP_RADIUS,
      angle: 0,
    },
    bullets: [],
    enemies: spawnWave(1, createRng(seed), width, height),
  };
}

export function step(game, input, dt) {
  const { width, height, seed } = game;
  const well = wellPos(width, height);
  const thrust = input.thrust || 0;
  const turn = input.turn || 0;

  const angle = game.ship.angle + turn * TURN_RATE * dt;
  const thrustAccel = scale(heading(angle), thrust * THRUST);
  const shipGrav = gravityAt(game.ship.pos, well, WELL_STRENGTH);
  const shipNext = integrate(game.ship, add(shipGrav, thrustAccel), dt);
  const ship = {
    pos: wrap(shipNext.pos, width, height),
    vel: shipNext.vel,
    radius: game.ship.radius,
    angle,
  };

  let bullets = game.bullets.map((b) => {
    const next = integrate(b, { x: 0, y: 0 }, dt);
    return {
      pos: wrap(next.pos, width, height),
      vel: next.vel,
      radius: b.radius,
      ttl: b.ttl - dt,
    };
  }).filter((b) => b.ttl > 0);

  let enemies = game.enemies.map((e) => {
    const next = integrate(e, gravityAt(e.pos, well, WELL_STRENGTH), dt);
    return {
      pos: wrap(next.pos, width, height),
      vel: next.vel,
      radius: e.radius,
    };
  });

  let score = game.score;
  const hitEnemy = new Set();
  const hitBullet = new Set();
  for (let i = 0; i < bullets.length; i += 1) {
    for (let j = 0; j < enemies.length; j += 1) {
      if (hitEnemy.has(j)) continue;
      if (circlesOverlap(bullets[i].pos, bullets[i].radius, enemies[j].pos, enemies[j].radius)) {
        hitBullet.add(i);
        hitEnemy.add(j);
        score += SCORE_PER_KILL;
        break;
      }
    }
  }
  bullets = bullets.filter((_, i) => !hitBullet.has(i));
  enemies = enemies.filter((_, j) => !hitEnemy.has(j));

  let over = game.over;
  if (!over) {
    for (const enemy of enemies) {
      if (circlesOverlap(ship.pos, ship.radius, enemy.pos, enemy.radius)) {
        over = true;
        break;
      }
    }
  }

  let wave = game.wave;
  if (enemies.length === 0) {
    wave += 1;
    enemies = spawnWave(wave, createRng(seed), width, height);
    score += waveSize(wave) * SCORE_PER_KILL;
  }

  return {
    width,
    height,
    seed,
    wave,
    score,
    over,
    ship,
    bullets,
    enemies,
  };
}

export function fire(game) {
  const dir = heading(game.ship.angle);
  const bullet = {
    pos: { x: game.ship.pos.x, y: game.ship.pos.y },
    vel: add(game.ship.vel, scale(dir, BULLET_SPEED)),
    radius: BULLET_RADIUS,
    ttl: BULLET_TTL,
  };
  return {
    ...game,
    bullets: [...game.bullets, bullet],
  };
}