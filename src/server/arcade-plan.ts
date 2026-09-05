import type { MissionTask } from '../core/types';
import { defaultChecksFor } from '../core/mission';

/**
 * The arcade showcase plan.
 *
 * Same honest split as the forge fixture: the tests and the render shell are
 * given, the logic is missing. A worker can read the tests it must satisfy and
 * cannot edit them, so the only way to a green suite is code that actually works.
 *
 * The reason this fixture exists alongside forge-app is that its output is
 * *visible*. Forge proves the loop on a receipt-splitting library, which is
 * correct and completely unmemorable. This produces something you can play, which
 * makes the claim "free models under a $0 budget wrote this" checkable by anyone,
 * not just by reading a test summary.
 *
 * Committed rather than planner-generated, for the same reason as the forge plan:
 * a benchmark whose task graph changes per run measures the planner.
 */
export function buildArcadePlan(missionId: string): MissionTask[] {
  const now = new Date().toISOString();

  const mk = (
    id: string,
    title: string,
    description: string,
    file: string,
    testFile: string,
    deps: string[],
    extraRefs: string[] = [],
  ): MissionTask => ({
    id,
    missionId,
    title,
    description,
    category: id === 'game' ? 'integration' : 'backend',
    dependencies: deps,
    requiredCapabilities: [
      { capability: 'code', weight: 1 },
      { capability: 'reasoning', weight: 0.9 },
      { capability: 'backend', weight: 0.7 },
    ],
    risk: id === 'game' ? 'high' : 'medium',
    qualityTarget: 0.95,
    budgetUsd: 0,
    fileScope: [`src/${file}`],
    referenceFiles: [`test/${testFile}`, ...extraRefs],
    verification: {
      checks: defaultChecksFor(
        { category: 'backend', fileScope: [`src/${file}`] },
        { testCommand: ['node', '--test', `test/${testFile}`], testLabel: `test/${testFile}` },
      ),
      acceptance: [`node --test test/${testFile} exits 0`],
    },
    state: 'PENDING',
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  });

  return [
    mk(
      'vector',
      'Implement 2D vector maths',
      'Create src/vector.js as an ES module exporting add(a,b), sub(a,b), scale(v,k), ' +
        'length(v), normalize(v) and limit(v,max). Vectors are plain objects {x,y}. ' +
        'Every function returns a NEW object and never mutates its arguments. ' +
        'normalize of a zero vector returns {x:0,y:0} rather than NaN. ' +
        'limit returns the vector unchanged when it is already shorter than max.',
      'vector.js',
      'vector.test.js',
      [],
    ),
    mk(
      'physics',
      'Implement gravity and collision',
      'Create src/physics.js as an ES module exporting gravityAt(pos, wellPos, strength), ' +
        'integrate(body, accel, dt), circlesOverlap(aPos, aR, bPos, bR) and wrap(pos, w, h). ' +
        'gravityAt returns an acceleration vector pointing from pos toward wellPos whose ' +
        'magnitude falls off with distance and stays finite at distance zero, soften the ' +
        'denominator. integrate returns a NEW {pos, vel} where vel += accel*dt and then ' +
        'pos += vel*dt; it must not mutate the body it is given. wrap moves a point across ' +
        'to the opposite edge when it leaves the arena. Import what you need from ./vector.js.',
      'physics.js',
      'physics.test.js',
      ['vector'],
    ),
    mk(
      'spawner',
      'Implement deterministic wave spawning',
      'Create src/spawner.js as an ES module exporting createRng(seed), waveSize(wave) and ' +
        'spawnWave(wave, rng, width, height). createRng returns a seeded pseudo-random ' +
        'function producing values in [0,1), the same seed must always produce the same ' +
        'sequence, so use something like mulberry32 rather than Math.random. ' +
        'waveSize(1) is exactly 3 and grows with the wave number. spawnWave returns ' +
        'waveSize(wave) enemies, each { pos:{x,y}, vel:{x,y}, radius } positioned inside the ' +
        'arena bounds, drawing every random value from the rng passed in so the result is ' +
        'reproducible.',
      'spawner.js',
      'spawner.test.js',
      [],
    ),
    mk(
      'game',
      'Implement the game state machine',
      'Create src/game.js as an ES module exporting createGame(width, height, seed), ' +
        'step(game, input, dt) and fire(game). All three are PURE: they return a new game ' +
        'object and never mutate the one passed in. createGame starts on wave 1 with score 0, ' +
        'no bullets, over:false, a ship, and the first wave of enemies from spawnWave. ' +
        'step advances the ship using gravityAt and integrate from ./physics.js, moves ' +
        'bullets and enemies, removes bullets once their ttl runs out so the array cannot ' +
        'grow without bound, resolves bullet/enemy collisions with circlesOverlap, and when ' +
        'no enemies remain increments wave and spawns the next one. score never decreases. ' +
        'fire returns a new game with exactly one additional bullet whose velocity is ' +
        'non-zero and directed away from the ship. Import from ./vector.js, ./physics.js ' +
        'and ./spawner.js.',
      'game.js',
      'game.test.js',
      ['vector', 'physics', 'spawner'],
    ),
  ];
}
