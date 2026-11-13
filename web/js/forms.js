// forms.js — the shapes a skin (or a built-in scene) may ask for besides voxel boxes, so a pumpkin has real ribs,
// a witch hat a bent tip and a buckle a rounded ring. Still data: skins.json names a shape and gives its numbers,
// in voxels like the boxes; this file checks them and does the math, forms3d.js turns them into meshes. Pure
// logic, run in Node by the tests.
//
//   A part's "shapes" (measured from the part's pivot; each may have "at": [x, y, z], "turn": [x, y, z] degrees,
//   its own "color", "glow" and "finish", "mirror": true for a second one on the other side of the pivot (the
//   other lens, the other half of a moustache), and, in a skin's sprout, "sway": how much of the old sprout's
//   swing it keeps, 0 to 1; a thick stem stands still, a tendril may wave a little):
//     tube    "path": points the spine goes through, "radius": one number or a list along the spine (0 ends in
//             a tip), "ridges" and "ridge": lengthwise grooves (a pumpkin stem), "bands": rings around it
//             ("span": [from, to] of the spine, "lift" above the surface, their own color and finish),
//             "closed": true joins the end to the start (a ring: the rim of a pair of glasses)
//     lathe   "profile": [radius, height] points turned around the vertical axis, "wave": [height, count,
//             phase°] makes the edge go up and down (a hat brim)
//     plate   "outline": a flat [x, y] polygon, "hole": another one cut out of it, "depth", "bevel" (rounded
//             edges), "round" (rounded corners)
//   A skin's "body": { "form": "gourd", ... } swaps the box for a ribbed gourd (gourdOf); "sprout": shapes that
//   stand in for the two leaves; "carve": a hole cut in the front with light inside (carveOf).
//
//   validShapes(list) → the shapes that can be built
//   gourdOf(body), carveOf(carve) → the checked numbers, or null
//   roundedRect(a, b, r) → { length, at(s) → { x, z, nx, nz } }   the body's cross-section, by arc length
//   ribs(count, length, uneven) → rib edges along the section; ribBump(t) → a rib's height across it (0 to 1)
//   gourdScale(yn, round) → how wide the gourd is at a height (-1 the bottom, 1 the top)
//   roundCorners(points, radius, steps) → the polygon with its corners rounded
//   radiusAt(radius, t) → the tube's radius at t (0 to 1 along the spine)

import { seededRandom } from './seeded-random.js';

const HEX = /^#[0-9a-f]{6}$/i;
export const KINDS = Object.freeze(['tube', 'lathe', 'plate']);
export const FINISHES = Object.freeze(['plastic', 'matte', 'leather', 'satin', 'metal', 'rind', 'gloss', 'glass', 'tinted', 'hair']);
export const LIMIT = Object.freeze({ shapes: 24, points: 48, bands: 4, ribs: 48 });

const numbers = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const pointList = (list, n, min) => Array.isArray(list) && list.length >= min && list.length <= LIMIT.points
  && list.every((p) => numbers(p, n));
const within = (v, low, high, otherwise) => (Number.isFinite(v) ? Math.max(low, Math.min(high, v)) : otherwise);
const hexOr = (v, otherwise = null) => (HEX.test(String(v)) ? String(v) : otherwise);

// what every shape may carry: where it is, how it is turned and what it is made of (null: the part's own)
function look(shape) {
  return {
    at: numbers(shape.at, 3) ? shape.at : [0, 0, 0],
    turn: numbers(shape.turn, 3) ? shape.turn : [0, 0, 0],
    color: hexOr(shape.color),
    glow: hexOr(shape.glow),
    finish: FINISHES.includes(shape.finish) ? shape.finish : null,
    sway: within(shape.sway, 0, 1, 0),
    mirror: shape.mirror === true,
  };
}

function tube(shape) {
  if (!pointList(shape.path, 3, 2)) return null;
  const list = Array.isArray(shape.radius) ? shape.radius : [shape.radius];
  if (!list.length || list.length > LIMIT.points || !list.every((r) => Number.isFinite(r) && r >= 0)) return null;
  const bands = (Array.isArray(shape.bands) ? shape.bands : []).slice(0, LIMIT.bands)
    .filter((b) => b && numbers(b.span, 2) && b.span[0] >= 0 && b.span[1] <= 1 && b.span[0] < b.span[1])
    .map((b) => ({ span: b.span, lift: within(b.lift, 0, 2, 0.1), ...look(b) }));
  return { kind: 'tube', path: shape.path, radius: list, ridges: Math.round(within(shape.ridges, 0, 16, 0)),
    ridge: within(shape.ridge, 0, 0.5, 0.12), bands, closed: shape.closed === true && shape.path.length >= 3, ...look(shape) };
}

function lathe(shape) {
  if (!pointList(shape.profile, 2, 2) || shape.profile.some((p) => p[0] < 0)) return null;
  const wave = numbers(shape.wave, 3) ? shape.wave : [0, 0, 0];
  return { kind: 'lathe', profile: shape.profile, wave: [wave[0], Math.round(within(wave[1], 0, 8, 0)), wave[2]],
    ...look(shape) };
}

function plate(shape) {
  if (!pointList(shape.outline, 2, 3)) return null;
  return { kind: 'plate', outline: shape.outline, hole: pointList(shape.hole, 2, 3) ? shape.hole : null,
    depth: within(shape.depth, 0.01, 20, 0.5), bevel: within(shape.bevel, 0, 2, 0),
    round: within(shape.round, 0, 5, 0), ...look(shape) };
}

const CHECKS = { tube, lathe, plate };

export function validShapes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, LIMIT.shapes).map((s) => (s && CHECKS[s.kind] ? CHECKS[s.kind](s) : null)).filter(Boolean);
}

// the ribbed body. ribs: how many around; groove: how deep between them (voxels); corner: the corner of the
// cross-section seen from above (voxels); round: how boxy from the side (2 a ball, 5 nearly a box); crown: where
// the ribs meet on top, [x, z] voxels from the middle (under the stem); dip: the hollow there; uneven: how much
// the ribs differ in width (0 to 0.4); shade: how much darker the grooves are; inset: the arms move this far in
export function gourdOf(body) {
  if (!body || body.form !== 'gourd') return null;
  return {
    form: 'gourd',
    ribs: Math.round(within(body.ribs, 4, LIMIT.ribs, 24)),
    groove: within(body.groove, 0, 1.5, 0.45),
    corner: within(body.corner, 0.5, 7.5, 4.5),
    round: within(body.round, 2, 8, 3.2),
    crown: numbers(body.crown, 2) ? [within(body.crown[0], -8, 8, 0), within(body.crown[1], -5, 5, 0)] : [0, 0],
    dip: within(body.dip, 0, 2, 0.6),
    uneven: within(body.uneven, 0, 0.4, 0.15),
    shade: within(body.shade, 0, 0.8, 0.3),
    inset: within(body.inset, 0, 2, 0.8),
  };
}

// the carved mouth: "outline" [x, y] voxels around "at" ([x, y] from the floor under the mascot's middle),
// "depth" of the cut, "round" corners, "glow": [middle, edge] colors of the light inside, "wall": the cut edge,
// "flicker": false for a light that holds still (a mouth, not a candle)
export function carveOf(carve) {
  if (!carve || !pointList(carve.outline, 2, 3)) return null;
  const glow = Array.isArray(carve.glow) ? carve.glow : [];
  return {
    outline: carve.outline,
    at: numbers(carve.at, 2) ? carve.at : [0, 10],
    depth: within(carve.depth, 0.1, 3, 0.7),
    round: within(carve.round, 0, 1, 0.12),
    glow: [hexOr(glow[0], '#fff04a'), hexOr(glow[1], '#ffb21f')],
    wall: hexOr(carve.wall, '#f58a1a'),
    flicker: carve.flicker !== false,
  };
}

// a rectangle of half sides a (x) and b (z) with corners of radius r, walked by arc length from the front middle
// (x 0, z b) toward +x and all the way around; nx, nz: the way out
export function roundedRect(a, b, r) {
  const radius = Math.max(0, Math.min(r, a, b));
  const quarter = (Math.PI / 2) * radius;
  const flatX = a - radius;
  const flatZ = b - radius;
  // the pieces in order: half the front, corner, the right side, corner, the back, corner, the left side,
  // corner, the other half of the front. Each: [length, start x, start z, direction or corner middle]
  const corner = (cx, cz, from) => ({ len: quarter, arc: [cx, cz, from] });
  const line = (len, x, z, dx, dz) => ({ len, line: [x, z, dx, dz] });
  const pieces = [
    line(flatX, 0, b, 1, 0), corner(flatX, flatZ, Math.PI / 2),
    line(2 * flatZ, a, flatZ, 0, -1), corner(flatX, -flatZ, 0),
    line(2 * flatX, flatX, -b, -1, 0), corner(-flatX, -flatZ, -Math.PI / 2),
    line(2 * flatZ, -a, -flatZ, 0, 1), corner(-flatX, flatZ, Math.PI),
    line(flatX, -flatX, b, 1, 0),
  ];
  const length = pieces.reduce((sum, p) => sum + p.len, 0);
  function at(s) {
    let left = ((s % length) + length) % length;
    for (const p of pieces) {
      if (left > p.len) { left -= p.len; continue; }
      if (p.line) {
        const [x, z, dx, dz] = p.line;
        return { x: x + dx * left, z: z + dz * left, nx: -dz, nz: dx };
      }
      const [cx, cz, from] = p.arc;
      const angle = from - (radius ? left / radius : 0);       // clockwise seen from above
      return { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius, nx: Math.cos(angle), nz: Math.sin(angle) };
    }
    return { x: 0, z: b, nx: 0, nz: 1 };
  }
  return { length, at };
}

// where each rib starts along the section: count + 1 edges, the first rib centred on the front middle (s = 0),
// each edge pushed a little (uneven, a share of a rib's width) the same way every time
export function ribs(count, length, uneven = 0) {
  const random = seededRandom(count * 7919 + 13);
  const width = length / count;
  const push = Array.from({ length: count }, () => (random() - 0.5) * 2 * uneven * width);
  return Array.from({ length: count + 1 }, (_, i) => (i - 0.5) * width + push[i % count]);
}

// a rib seen in section: round on top, steep into the groove (0 in the groove, 1 on the crest)
export const ribBump = (t) => Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));

// the gourd from the side is a superellipse: at height yn (-1 the bottom, 1 the top) its section is this wide
// (1 at the middle, 0 at the two ends)
export function gourdScale(yn, round) {
  const y = Math.min(1, Math.abs(yn));
  return (1 - y ** round) ** (1 / round);
}

// every corner of a closed polygon replaced by a small arc (a quadratic curve through `steps` points); the cut
// never takes more than 45% of a side, so short sides survive
export function roundCorners(points, radius, steps = 4) {
  const n = points.length;
  if (!(radius > 0) || n < 3) return points.map((p) => [p[0], p[1]]);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const before = points[(i + n - 1) % n];
    const here = points[i];
    const after = points[(i + 1) % n];
    const toward = (other) => {
      const dx = other[0] - here[0];
      const dy = other[1] - here[1];
      const len = Math.hypot(dx, dy) || 1;
      const cut = Math.min(radius, len * 0.45);
      return [here[0] + (dx / len) * cut, here[1] + (dy / len) * cut];
    };
    const a = toward(before);
    const b = toward(after);
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * here[0] + t * t * b[0], u * u * a[1] + 2 * u * t * here[1] + t * t * b[1]]);
    }
  }
  return out;
}

// the radius list read as a smooth curve along the spine (one number: the same all along)
export function radiusAt(radius, t) {
  const list = Array.isArray(radius) ? radius : [radius];
  if (list.length === 1) return list[0];
  const place = Math.max(0, Math.min(1, t)) * (list.length - 1);
  const i = Math.min(list.length - 2, Math.floor(place));
  const k = place - i;
  const ease = k * k * (3 - 2 * k);                              // no kink where two values meet
  return list[i] + (list[i + 1] - list[i]) * ease;
}
