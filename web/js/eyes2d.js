// eyes2d.js — the eyes and the brows, where almost all of the expression lives.
//
// The eye is still the mascot's own: a tall 2 × 5 voxel black bar with the white glint in the top corner. It does
// not get Bluey's white or round pupil; the expressiveness comes from what happens to the bar:
//   gaze      the whole bar moves inside the eye socket (the bar is the pupil), and the head turns behind it (measures.js)
//   pupil     the bar grows and shrinks with the spring (it jumps on a startle)
//   blink     the lid comes down from the top until only a slit is left (the mascot's low slit of closed eyes)
//   lids      heavy when sleepy (the top half covered, with the crease), soft from above when pointing, and the
//             cheeks pushing up from below when it is happy
//   arcs      happy, the bar turns into an ∩ arc; resting, a ∪ curve (half-voxel glyphs, hard edge)
// The brows are new: a dark terracotta strip, the same color as the legs, tone on tone, made of six half-voxel
// pieces. They rise, drop and tilt in steps, with Bluey's math and targets.

import { rect, glyph } from './pixel.js';
import { COLOR, EYE, LAYER, PX, clamp } from './measures.js';
import { eyeRows } from './eyeshapes.js';

const REACH = Object.freeze({ x: 1.3, y: 0.7 });          // voxels the bar travels to each side
const CENTER_Y = EYE.top + EYE.height / 2;
const SLIT = 0.45;                                        // the closed eye: a slit this tall
const SINK = 0.3;                                         // when sleepy, the eye sinks under the lid
const CREASE = Object.freeze({ half: 1.4, height: 0.35 }); // the heavy lid's line
// y: the middle, at rest (just below the top) · boost: how far Bluey's brow raise moves here · tilt: step per
// radian (less than the thickness, so the three bricks don't come apart) · follow: rises along when it looks up
const BROW = Object.freeze({ y: 1.45, height: 0.6, width: 3, pieces: 6, boost: 1.6, tilt: 1, arch: 0.15, follow: 0.4 });

const ARC = Object.freeze([            // happy: ∩ (each cell, half a voxel)
  '..####..',
  '.######.',
  '###..###',
  '##....##',
  '##....##',
]);
const CURVE = Object.freeze([          // resting: ∪, closed in peace
  '##....##',
  '###..###',
  '.######.',
  '..####..',
]);

function normalLook(q) {
  const n = Math.hypot(q.lookX, q.lookY);
  return n > 1 ? [q.lookX / n, q.lookY / n] : [q.lookX, q.lookY];
}

export function drawEyes(ctx, g, q) {
  const [gx, gy] = normalLook(q);
  EYE.xs.forEach((x, i) => {
    const cx = x + EYE.width / 2;
    const scene = q.eyes?.[i] ? eyeRows(q.eyes[i], i) : null;   // a scene's eyes (eyeshapes.js) replace the bar
    if (scene) stampEye(ctx, g, scene, cx + gx * REACH.x * 0.5, CENTER_Y);
    else if (q.mood === 'resting') stampEye(ctx, g, CURVE, cx, CENTER_Y + 0.6);
    else if (q.mood === 'happy' && q.squint > 0.6) stampEye(ctx, g, ARC, cx, CENTER_Y - 0.4);
    else openEye(ctx, g, q, cx + gx * REACH.x, q.mood === 'sleepy' ? Math.max(gy, 0) : gy);   // sleepy, it won't look up
  });
}

function stampEye(ctx, g, rows, cx, cy) {
  const step = Math.max(1, Math.round(g.u / 2));
  const x = g.X(cx, LAYER.eyes) - (rows[0].length * step) / 2;
  const y = g.Y(cy) - (rows.length * step) / 2;
  glyph(ctx, rows, x, y, step, COLOR.eye);
}

// the bar and the lids; the lids cover a fixed band of the eye socket (they don't move with the gaze)
function openEye(ctx, g, q, cx, gy) {
  const grow = 1 + (q.pupil - 1) * 0.7;
  const open = Math.max(0.06, 1 - q.closed) * (1 - q.talk * 0.12);
  const full = EYE.height * grow;
  const h = Math.max(SLIT, full * open);
  const w = EYE.width * (1 + (q.pupil - 1) * 0.35) * (1 + 0.25 * q.closed);
  const mid = CENTER_Y + gy * REACH.y + (full - h) * 0.2 + (q.mood === 'sleepy' ? SINK : 0);
  let top = mid - h / 2;
  let bottom = mid + h / 2;
  const crease = q.mood === 'sleepy' ? EYE.top + EYE.height * (q.quiet ? 0.5 : 0.5 + 0.06 * Math.sin(q.time * 1.3)) : null;
  if (crease !== null) top = Math.max(top, crease);
  if (q.mood === 'pointing') top = Math.max(top, EYE.top + EYE.height * 0.2);
  if (q.squint > 0.02) bottom = Math.min(bottom, EYE.top + EYE.height * (1 - 0.7 * q.squint));
  bar(ctx, g, cx, w, top, bottom);
  if (crease !== null) {
    const x0 = g.X(cx - CREASE.half, LAYER.eyes);
    rect(ctx, x0, g.Y(crease - CREASE.height), g.X(cx + CREASE.half, LAYER.eyes), g.Y(crease), COLOR.eyelid);
  }
}

// the black bar with the glint in the top-left corner (the mascot's white voxel)
function bar(ctx, g, cx, w, top, bottom) {
  const tall = bottom - top;
  if (tall <= 0) return;
  const x0 = g.X(cx - w / 2, LAYER.eyes);
  const x1 = g.X(cx + w / 2, LAYER.eyes);
  rect(ctx, x0, g.Y(top), x1, g.Y(bottom), COLOR.eye);
  if (tall < 1.6) return;
  rect(ctx, x0, g.Y(top), g.X(cx, LAYER.eyes), g.Y(top + w / 2), COLOR.glint);
}

export function drawBrows(ctx, g, q) {
  const raise = ((clamp(q.browRaise, -10, 18) * 0.7) / PX) * BROW.boost;
  const [, gy] = normalLook(q);
  EYE.xs.forEach((x, i) => {
    const side = i === 0 ? -1 : 1;
    let angle = -q.browTilt * side;
    if (q.mood === 'thinking' && side === 1) angle -= 0.25;   // the right one goes up: curious
    const cx = x + EYE.width / 2 + side * 0.2;
    const yc = BROW.y - raise + gy * BROW.follow;
    for (let k = 0; k < BROW.pieces; k++) piece(ctx, g, cx, yc, angle, k);
  });
}

// Bluey's arch in pieces: the middle a little higher, the ends stepped according to the tilt
function piece(ctx, g, cx, yc, angle, i) {
  const size = BROW.width / BROW.pieces;
  const x = -BROW.width / 2 + (i + 0.5) * size;               // the middle of the piece, from the center
  const curve = 1 - (2 * x / BROW.width) ** 2;
  const y = yc + Math.sin(angle) * x * BROW.tilt - BROW.arch * curve;
  const y0 = Math.max(0.05, y - BROW.height / 2);
  const c = LAYER.brows;
  rect(ctx, g.X(cx + x - size / 2, c), g.Y(y0), g.X(cx + x + size / 2, c), g.Y(y0 + BROW.height), COLOR.brow);
}
