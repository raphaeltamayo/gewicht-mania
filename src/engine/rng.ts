/**
 * Small seeded PRNG (mulberry32). The seed lives in the game state so a whole
 * match can be replayed from its starting seed — handy when a playtest turns up
 * a weird board and you want it back.
 */
export function nextRandom(state: number): [value: number, next: number] {
  let t = (state + 0x6d2b79f5) | 0;
  let r = t;
  r = Math.imul(r ^ (r >>> 15), r | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return [value, t];
}

/** Integer in [min, max] inclusive. */
export function randomInt(state: number, min: number, max: number): [number, number] {
  const [v, next] = nextRandom(state);
  return [min + Math.floor(v * (max - min + 1)), next];
}

/** Fisher-Yates. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: readonly T[], state: number): [T[], number] {
  const out = items.slice();
  let rng = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = randomInt(rng, 0, i);
    rng = next;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, rng];
}
