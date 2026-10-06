/** Deterministic seeded RNG (mulberry32) so games and tests are reproducible. */

export type Rng = () => number;

/** Create a seeded RNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, max). */
export function randInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}
