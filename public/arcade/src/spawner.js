/**
 * Deterministic wave spawning utilities.
 *
 * All randomness flows through an explicit seeded PRNG (mulberry32) so that
 * spawning a wave with the same seed always yields the identical result.
 */

/**
 * Create a seeded pseudo-random generator (mulberry32).
 * Returns a function producing values in [0, 1). The same seed always
 * produces the same sequence.
 *
 * @param {number} seed
 * @returns {() => number}
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Number of enemies for a given wave. Wave 1 is exactly 3 and grows
 * linearly with the wave number.
 *
 * @param {number} wave
 * @returns {number}
 */
export function waveSize(wave) {
  return 2 + wave;
}

/**
 * Spawn the enemies for a wave. Every random value is drawn from the
 * provided rng, making the result reproducible from the same seed.
 *
 * @param {number} wave
 * @param {() => number} rng
 * @param {number} width arena width
 * @param {number} height arena height
 * @returns {Array<{pos:{x:number,y:number},vel:{x:number,y:number},radius:number}>}
 */
export function spawnWave(wave, rng, width, height) {
  const count = waveSize(wave);
  const enemies = [];
  for (let i = 0; i < count; i += 1) {
    const radius = 10 + rng() * 10;
    const x = radius + rng() * Math.max(0, width - radius * 2);
    const y = radius + rng() * Math.max(0, height - radius * 2);
    const angle = rng() * Math.PI * 2;
    const speed = 1 + rng() * 2;
    enemies.push({
      pos: { x, y },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius,
    });
  }
  return enemies;
}