// decorations2d.js — what comes out of the head: the thought bubbles and the sleepy z letters.
//
//   bubbles (thinking)   the mascot's three little squares on a diagonal, in smoke tones; they appear one at a time
//                        and sway gently
//   letters (sleepy, resting)   a 5 × 5 "z": born at the top right of the head, they rise on a diagonal, grow and
//                        fade out; white or lavender. Resting: z, z, Z every 1.5 s.
//                        Sleepy: only the small ones, every 3 s (it is still dozing off).
// With "reduce motion": the three bubbles stand still and a fixed "zZ" is shown.
// Everything comes from the time since the mood changed: nothing is kept between frames, the same instant gives the
// same drawing.

import { rect, glyph } from './pixel.js';
import { COLOR } from './measures.js';

const BUBBLES = Object.freeze([[0.6, 0.9, 0.7], [2.0, 2.5, 1.0], [3.9, 4.4, 1.4]]);   // dx, rise, size (voxels)
const BUBBLES_FROM = Object.freeze({ x: 19.5, y: -0.6 });
const BUBBLE = Object.freeze({ first: 0.2, each: 0.25, sway: 0.18, layer: 0.3 });

const Z = Object.freeze(['#####', '...#.', '..#..', '.#...', '#####']);
export const ZZZ = Object.freeze({
  heights: Object.freeze([1.0, 1.45, 2.1]),   // height of each one, in voxels: z, z, Z
  life: 4.5, rise: 6, drift: 4, sway: 0.35,
  from: Object.freeze({ x: 20.5, y: -0.8 }),
});
export const RHYTHM = Object.freeze({
  resting: Object.freeze({ interval: 1.5, kinds: 3 }),
  sleepy: Object.freeze({ interval: 3, kinds: 2 }),
});
const STILL = Object.freeze([[0, 1.0, -1.0], [2, 3.0, -3.2]]);   // [letter, dx, dy] of the still "zZ"

// the size over its life: grows at the start, holds, then shrinks until it vanishes at the end
export const sizeAt = (k) => (k < 0.3 ? 0.35 + (0.65 * k) / 0.3 : k < 0.75 ? 1 : Math.max(0, (1 - k) / 0.25));

// the letters alive at instant t (seconds since the mood change): [{ n, letter, k }], k from 0 to 1 over its life
export function lettersAt(mood, t) {
  const rhythm = RHYTHM[mood];
  if (!rhythm || t < 0) return [];
  const alive = [];
  const last = Math.floor(t / rhythm.interval);
  for (let n = Math.max(0, Math.ceil((t - ZZZ.life) / rhythm.interval)); n <= last; n++) {
    const k = (t - n * rhythm.interval) / ZZZ.life;
    if (k >= 0 && k < 1) alive.push({ n, letter: n % rhythm.kinds, k });
  }
  return alive;
}

export function drawBubbles(ctx, g, q) {
  if (q.mood !== 'thinking') return;
  const fit = g.fit(BUBBLES_FROM.y, BUBBLES[2][1] + BUBBLES[2][2] / 2);
  BUBBLES.forEach(([dx, rise, size], i) => {
    if (!q.quiet && q.sinceMood < BUBBLE.first + BUBBLE.each * i) return;
    const sway = q.quiet ? 0 : BUBBLE.sway * Math.sin(q.time * 3 + i);
    const x = BUBBLES_FROM.x + dx;
    const y = BUBBLES_FROM.y - rise * fit + sway;
    const half = size / 2;
    rect(ctx, g.X(x - half, BUBBLE.layer), g.Y(y - half), g.X(x + half, BUBBLE.layer), g.Y(y + half), COLOR.bubbles[i]);
  });
}

export function drawLetters(ctx, g, q) {
  if (!RHYTHM[q.mood]) return;
  const fit = g.fit(ZZZ.from.y, ZZZ.rise);
  if (q.quiet) {
    for (const [letter, dx, dy] of STILL) {
      if (letter < RHYTHM[q.mood].kinds) letterZ(ctx, g, ZZZ.from.x + dx, ZZZ.from.y + dy * fit, ZZZ.heights[letter], COLOR.letters[letter === 0 ? 0 : 1]);
    }
    return;
  }
  const kinds = RHYTHM[q.mood].kinds;
  for (const { n, letter, k } of lettersAt(q.mood, q.sinceMood)) {
    const x = ZZZ.from.x + ZZZ.drift * k + ZZZ.sway * Math.sin(k * 7);
    const y = ZZZ.from.y - ZZZ.rise * fit * k;
    const tone = COLOR.letters[(Math.floor(n / kinds) + letter) % COLOR.letters.length];
    letterZ(ctx, g, x, y, ZZZ.heights[letter] * sizeAt(k), tone);
  }
}

// a "z" centered on (x, y) voxels, `height` voxels tall: each cell of the glyph, a square with a whole-pixel side
function letterZ(ctx, g, x, y, height, color) {
  const step = Math.round((height / Z.length) * g.u);
  if (step < 1) return;
  const half = (Z.length * step) / 2;
  glyph(ctx, Z, g.X(x, 0) - half, g.Y(y) - half, step, color);
}
