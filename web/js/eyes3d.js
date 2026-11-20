// eyes3d.js — the eyes a scene asks for (eyeshapes.js: ♥, ×, > <, !, ★, ●) as smooth pieces of the same glossy black
// plastic as the bars, for the 3D mascot. The 2D face stamps the half-voxel glyphs; in 3D the glyphs looked like a
// pile of little grey blocks (every tiny rounded box caught the room's light), so here each shape is drawn as a
// curve and pressed out with rounded edges: a heart is a heart, a star has five points. Drawn for the LEFT eye;
// the right eye is the mirror image (> on the left, < on the right). Units of the figure, centred on the eye.
//
//   EYE_FORMS               name → pieces: { shape(THREE) → THREE.Shape, at: [x, y], turn: degrees }
//   buildEye(THREE, name, material, side) → THREE.Group | null   side 1: mirrored

import { roundCorners } from './forms.js';

const DEPTH = 0.05;
const BEVEL = Object.freeze({ bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 4, curveSegments: 18 });
const RAD = Math.PI / 180;

const polygon = (THREE, points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));

// a stroke with round ends, lying along x, centred
function capsule(THREE, length, thick) {
  const r = thick / 2;
  const half = length / 2 - r;
  const s = new THREE.Shape();
  s.moveTo(-half, -r);
  s.lineTo(half, -r);
  s.absarc(half, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-half, r);
  s.absarc(-half, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

function circle(THREE, r) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

function heart(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.17);
  s.bezierCurveTo(-0.08, -0.09, -0.215, -0.02, -0.205, 0.075);
  s.bezierCurveTo(-0.195, 0.165, -0.11, 0.2, -0.06, 0.18);
  s.bezierCurveTo(-0.025, 0.166, -0.004, 0.14, 0, 0.11);
  s.bezierCurveTo(0.004, 0.14, 0.025, 0.166, 0.06, 0.18);
  s.bezierCurveTo(0.11, 0.2, 0.195, 0.165, 0.205, 0.075);
  s.bezierCurveTo(0.215, -0.02, 0.08, -0.09, 0, -0.17);
  return s;
}

// five points, one straight up, the corners a little rounded so it reads as plastic, not paper
function star(THREE, outer = 0.215, inner = 0.095) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return polygon(THREE, roundCorners(points, 0.022, 4));
}

export const EYE_FORMS = Object.freeze({
  dot: [{ shape: (T) => circle(T, 0.15), at: [0, 0], turn: 0 }],
  cross: [
    { shape: (T) => capsule(T, 0.42, 0.095), at: [0, 0], turn: 45 },
    { shape: (T) => capsule(T, 0.42, 0.095), at: [0, 0], turn: -45 },
  ],
  chevron: [                                               // > : two strokes meeting at the right
    { shape: (T) => capsule(T, 0.3, 0.09), at: [-0.005, 0.095], turn: -43 },
    { shape: (T) => capsule(T, 0.3, 0.09), at: [-0.005, -0.095], turn: 43 },
  ],
  heart: [{ shape: heart, at: [0, 0], turn: 0 }],
  bang: [
    { shape: (T) => polygon(T, roundCorners([[-0.06, 0.24], [0.06, 0.24], [0.035, -0.07], [-0.035, -0.07]], 0.035, 5)), at: [0, 0.02], turn: 0 },
    { shape: (T) => circle(T, 0.052), at: [0, -0.17], turn: 0 },
  ],
  star: [{ shape: star, at: [0, 0], turn: 0 }],
});

export function buildEye(THREE, name, material, side = 0) {
  const pieces = EYE_FORMS[name];
  if (!pieces) return null;
  const group = new THREE.Group();
  for (const piece of pieces) {
    const geometry = new THREE.ExtrudeGeometry(piece.shape(THREE), { depth: DEPTH, ...BEVEL });
    geometry.translate(0, 0, -DEPTH / 2);                 // centred on the eye's plane, like the bar
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(piece.at[0], piece.at[1], 0);
    mesh.rotation.z = piece.turn * RAD;
    group.add(mesh);
  }
  if (side === 1) group.scale.x = -1;                      // the right eye is the mirror image
  return group;
}
