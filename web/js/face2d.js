// face2d.js — draws one animator pose: the voxel mascot from the front, in pixel art, on a 2D canvas.
//
//   drawFace(ctx, pose, meas, geometry?)   meas from measures(width, height), in device px;
//     the geometry (createGeometry) can be passed in so it is reused across frames
//
// Drawn back to front: legs, arms, body, cheeks, mouth, eyes, brows, sprout and whatever comes out of the head.
// The mouth only shows while it talks: at rest the face is the mascot's own, with no mouth.

import { rect, ramp } from './pixel.js';
import { COLOR, BODY, LEG, ARM, CHEEK, LAYER, PX, BOOST, clamp, createGeometry } from './measures.js';
import { drawEyes, drawBrows } from './eyes2d.js';
import { drawBubbles, drawLetters } from './decorations2d.js';

export { measures, createGeometry } from './measures.js';

const CHEEK_TONES = ramp(COLOR.cheek, COLOR.blush, 16);
const MOUTH = Object.freeze({ x: BODY.width / 2, top: 8.6, width: 2.4, open: 1.4 });
const SPROUT = Object.freeze({ x: 7 });

export function drawFace(ctx, q, meas, g = createGeometry()) {
  g.update(q, meas);
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, meas.width, meas.height);
  legs(ctx, g);
  arm(ctx, g, -1, q.raiseL, q.stretchL);
  arm(ctx, g, 1, q.raiseR, q.stretchR);
  body(ctx, g);
  cheeks(ctx, g, q);
  mouth(ctx, g, q);
  drawEyes(ctx, g, q);
  drawBrows(ctx, g, q);
  sprout(ctx, g, q);
  drawBubbles(ctx, g, q);
  drawLetters(ctx, g, q);
  return g;
}

// four legs from the front (the back ones hide behind them), from the body down to the floor
function legs(ctx, g) {
  const c = LAYER.body;
  for (const x of LEG.xs) rect(ctx, g.X(x, c), g.Y(BODY.height), g.X(x + LEG.width, c), g.groundPx(), COLOR.leg);
}

// raise: the little arm slides up; stretch: it lies horizontal, pointing (3 × 5 becomes 6 × 2)
function arm(ctx, g, side, raise, stretch) {
  const wide = ARM.out + ARM.stretch * stretch;
  const tall = ARM.height - ARM.stretch * stretch;
  const y0 = ARM.top - ARM.raise * raise;
  const [xa, xb] = side < 0 ? [-wide, 0] : [BODY.width, BODY.width + wide];
  rect(ctx, g.X(xa, LAYER.body), g.Y(y0), g.X(xb, LAYER.body), g.Y(y0 + tall), COLOR.body);
}

// the set-back top, lighter (the sun hits it from above), without the corners; the bottom row a shade darker
function body(ctx, g) {
  const c = LAYER.body;
  rect(ctx, g.X(1, c), g.Y(0), g.X(BODY.width - 1, c), g.Y(1), COLOR.top);
  rect(ctx, g.X(0, c), g.Y(1), g.X(BODY.width, c), g.Y(BODY.height - 1), COLOR.body);
  rect(ctx, g.X(0, c), g.Y(BODY.height - 1), g.X(BODY.width, c), g.Y(BODY.height), COLOR.base);
}

// the mascot's cheeks, a shade lighter than the body, blush when it is happy
function cheeks(ctx, g, q) {
  const tone = CHEEK_TONES[Math.round(clamp((q.blush - 0.15) / 0.7, 0, 1) * 16)];
  const c = LAYER.cheeks;
  for (const x of CHEEK.xs) rect(ctx, g.X(x, c), g.Y(CHEEK.top), g.X(x + CHEEK.width, c), g.Y(CHEEK.top + 1), tone);
}

// opens with speech, like Bluey's; with the mouth wide open, the tongue shows
function mouth(ctx, g, q) {
  if (q.talk <= 0.04) return;
  const wide = MOUTH.width - 0.5 * q.talk;
  const tall = 0.5 + MOUTH.open * q.talk;
  const x0 = MOUTH.x - wide / 2;
  const y0 = MOUTH.top - 0.15 * q.talk;
  const c = LAYER.mouth;
  rect(ctx, g.X(x0, c), g.Y(y0), g.X(x0 + wide, c), g.Y(y0 + tall), COLOR.mouth);
  if (q.talk > 0.35) rect(ctx, g.X(x0 + wide * 0.2, c), g.Y(y0 + tall * 0.6), g.X(x0 + wide * 0.8, c), g.Y(y0 + tall), COLOR.tongue);
}

// a two-voxel stem and two leaves open in a V; it sways opposite the head turn and lags behind on a hop
function sprout(ctx, g, q) {
  const lag = g.hop - (q.sproutY / PX) * BOOST.hop;           // voxels: positive, the leaves sit lower
  const sway = q.sproutX * LAYER.sprout;
  const at = (k) => [sway * k, lag * k];
  const bit = (x, y, k, color) => {
    const [dx, dy] = at(k);
    rect(ctx, g.X(x + dx), g.Y(y + dy), g.X(x + 1 + dx), g.Y(y + 1 + dy), color);
  };
  bit(SPROUT.x, -1, 0.3, COLOR.stem);
  bit(SPROUT.x, -2, 0.6, COLOR.stem);
  bit(SPROUT.x - 1, -3, 0.85, COLOR.leaf);
  bit(SPROUT.x + 1, -3, 0.85, COLOR.leaf);
  bit(SPROUT.x - 2, -4, 1, COLOR.leafLight);
  bit(SPROUT.x + 2, -4, 1, COLOR.leafLight);
}
