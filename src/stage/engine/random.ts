/**
 * Deterministic randomness: the same layout on every visit and in every
 * test. mulberry32, as in Nodestra's environment harness
 * (`hell/env-src/lab.ts` › `seededRandom`).
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { seededRandom };
