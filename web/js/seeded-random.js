// seeded-random.js — seeded random numbers (mulberry32): the same seed gives the same sequence from 0 to 1.
// The face rolls blinks, gaze jumps and hops; with a seed, captures and tests repeat exactly.

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
