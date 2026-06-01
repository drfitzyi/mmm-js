// Small, fast, seedable PRNG (mulberry32). Used so spectral modifications are
// reproducible — essential for deterministic tests and repeatable output.

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next float in [-1, 1). */
  nextSigned(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextSigned: () => next() * 2 - 1,
  };
}
