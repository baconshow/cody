// measures.js — the 2D mascot's sizes and colors, and the math for where each voxel lands on screen.
//
// The mascot is the voxel mascot seen from the front, one little square per voxel: a 24 × 14 body on four legs of
// 5, a 3 × 5 arm on each side, 2 × 5 eyes with the glint in the top corner, a set-back top (no top corners) and the
// sprout on the head. The cheeks come from the mascot's voxel figure.
// The colors are those of the voxel blocks: light and dark terracotta, matte black, plain white, moss and jungle
// leaf; the bubbles and the z letters use the smoke and sleep tones.
//
// Coordinates in voxels: x from the left of the body, y from the top of the body downward (the top is y = 0; the legs, 14 to 19).
//   measures(width, height) → { mode, u, ox, oy, width, height }   device px; u = px per voxel
//     full   the whole mascot, with room above for the bubbles and the letters (small tile, gallery)
//     peek   wide screen (phone in landscape): the face big, peeking up from the bottom edge, as in Bluey
//   createGeometry() → g; g.update(pose, meas); g.X(vx, layer) and g.Y(vy) give device px

export const COLOR = Object.freeze({
  background: '#000000',
  body: '#cb743c', top: '#dc8550', base: '#b16234', leg: '#914c2c',
  eye: '#161618', glint: '#dfdfda', eyelid: '#743a20', brow: '#8a4628',
  cheek: '#df8e60', blush: '#f59a8c', mouth: '#22151a', tongue: '#e0626a',
  stem: '#4a7a2a', leaf: '#32952a', leafLight: '#45aa34',
  bubbles: Object.freeze(['#f2ece2', '#e4ddd2', '#d0c9bf']),
  letters: Object.freeze(['#ffffff', '#cdbbff']),
});

export const BODY = Object.freeze({ width: 24, height: 14 });
export const LEG = Object.freeze({ height: 5, width: 3, xs: Object.freeze([1, 6, 15, 20]) });
export const ARM = Object.freeze({ out: 3, height: 5, top: 3, raise: 4.5, stretch: 3 });
export const EYE = Object.freeze({ width: 2, height: 5, xs: Object.freeze([5, 17]), top: 2 });
export const CHEEK = Object.freeze({ width: 2, xs: Object.freeze([2, 20]), top: 10 });

// how far each layer moves when the head turns (voxels per unit of gaze): the eyes in front move the most,
// the sprout, behind, goes the other way. It is a head turn without rotating pixels (rotating jags the edge).
export const LAYER = Object.freeze({ body: 0.08, eyes: 0.5, brows: 0.45, cheeks: 0.35, mouth: 0.4, sprout: -0.5 });

// Bluey's drawing is 844 × 390 with 190 px eyes; our eye is 5 voxels: 38 px there per voxel here
export const PX = 38;
export const BOOST = Object.freeze({ hop: 1.6, talk: 16 });
const BREATH = 0.015;                 // the body stretches 1.5% up and down (the top moves ~0.2 voxel)
const TILT = 0.045;                   // the animator's maximum tilt, in radians

// what has to fit, in voxels
export const FRAME = Object.freeze({
  full: Object.freeze({ x0: -4, x1: 28, y0: -7, y1: 19.5 }),
  peek: Object.freeze({ x0: -4, x1: 28, y0: -5.5, y1: 12 }),
});
const PEEK_FROM_ASPECT = 1.8;         // width / height
const WHOLE_PIXEL_FROM = 3;           // from 3 px per voxel up, a voxel has a whole-pixel side: all the same size

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function measures(width, height) {
  const mode = width / height >= PEEK_FROM_ASPECT ? 'peek' : 'full';
  const f = FRAME[mode];
  const w = f.x1 - f.x0;
  const h = f.y1 - f.y0;
  let u = Math.max(0.5, Math.min(width / w, height / h));
  if (u >= WHOLE_PIXEL_FROM) u = Math.floor(u);
  const ox = Math.round((width - BODY.width * u) / 2);
  const oy = mode === 'peek' ? Math.round(height - f.y1 * u) : Math.round((height - h * u) / 2 - f.y0 * u);
  return { mode, u, ox, oy, width, height };
}

export function createGeometry() {
  const g = {
    u: 1, ox: 0, oy: 0, sx: 1, sy: 1, base: BODY.height, ground: BODY.height + LEG.height,
    turn: 0, hop: 0, visibleTop: -99,
    X: (vx, layer = 0) => g.ox + g.u * (BODY.width / 2 + (vx - BODY.width / 2) * g.sx + g.turn * layer),
    Y: (vy) => g.oy + g.u * (g.base - (BODY.height - vy) * g.sy),
    groundPx: () => g.oy + g.u * g.ground,
    // how much of a rise of `height` voxels fits above yFrom, up to the top edge of the screen
    fit: (yFrom, height) => clamp((yFrom - g.visibleTop - 0.4) / height, 0.3, 1),
    update: (q, meas) => update(g, q, meas),
  };
  return g;
}

// hop and talk lift the mascot; the hop squashes and stretches (keeping the volume); breathing stretches the body
function update(g, q, meas) {
  g.u = meas.u;
  g.ox = meas.ox;
  g.oy = meas.oy;
  g.hop = (q.hop / PX) * BOOST.hop;
  const talk = (q.talk * BOOST.talk) / PX;
  const stretch = 1 + clamp(q.hop / 900, -0.03, 0.03);
  g.sx = 2 - stretch;
  g.sy = stretch * (1 + BREATH * q.breath);
  g.base = BODY.height - g.hop - talk;
  g.ground = BODY.height + LEG.height - g.hop;
  g.turn = -q.tilt / TILT;
  g.visibleTop = -meas.oy / meas.u;
  return g;
}
