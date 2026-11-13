// The meshes of a skin's shapes (web/js/forms3d.js), built with the real three.js (it needs no page for geometry):
// every mesh is whole (no NaN), as big as the data says, and looks outward, so light falls on it the right way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../web/vendor/three/build/three.module.js';
import { validShapes, gourdOf, carveOf } from '../../web/js/forms.js';
import {
  createFinishes, buildShapes, gourdGeometry, rindMaterial, tubeGeometry, bandGeometry, latheGeometry, plateGeometry,
  carveMouth, unmask,
} from '../../web/js/forms3d.js';

const whole = (geometry) => {
  for (const name of ['position', 'normal']) {
    for (const v of geometry.attributes[name].array) assert.ok(Number.isFinite(v), `${name} has no NaN`);
  }
  geometry.computeBoundingBox();
  return geometry.boundingBox;
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// how many vertices look away from an axis or a point: a mesh turned inside out would fail this at once
function outward(geometry, from) {
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  let out = 0;
  let counted = 0;
  for (let i = 0; i < p.count; i += 1) {
    const away = from(p.getX(i), p.getY(i), p.getZ(i));
    const reach = Math.hypot(...away);
    if (reach < 1e-3) continue;
    counted += 1;
    if (away[0] * n.getX(i) + away[1] * n.getY(i) + away[2] * n.getZ(i) > 0) out += 1;
  }
  return out / counted;
}

test('the gourd fills the body\'s box without leaving it, looks outward and carries its shading', () => {
  const gourd = gourdOf({ form: 'gourd', ribs: 24, crown: [-3, 1] });
  const geometry = gourdGeometry(THREE, [2.4, 1.4, 1.6], gourd);
  const box = whole(geometry);
  assert.ok(near(box.max.x, 1.2, 0.02) && near(box.min.x, -1.2, 0.02), 'as wide as the box');
  assert.ok(near(box.max.z, 0.8, 0.02) && near(box.min.z, -0.8, 0.02), 'as deep');
  assert.ok(box.max.y <= 0.7 + 1e-6 && near(box.min.y, -0.7, 1e-6), 'as tall, with the hollow under the stem');
  assert.ok(outward(geometry, (x, y, z) => [x, y, z]) > 0.97);
  const color = geometry.attributes.color;
  assert.equal(color.count, geometry.attributes.position.count);
  const values = [...color.array];
  assert.ok(Math.min(...values) > 0.3 && Math.max(...values) <= 1, 'grooves darker, never black');
  assert.ok(new Set(values.map((v) => v.toFixed(2))).size > 10, 'not one flat color');
  // the ribs meet under the stem, not in the middle
  const p = geometry.attributes.position;
  const top = p.count - 1;
  assert.ok(near(p.getX(top), -0.3, 1e-6) && near(p.getZ(top), 0.1, 1e-6));
  assert.ok(near(p.getY(top), 0.7 - 0.06, 1e-6), 'the hollow');
  assert.deepEqual([geometry.attributes.normal.getY(top), geometry.attributes.normal.getY(0)], [1, -1]);
});

test('the gourd\'s material is its own and takes the ribs\' shading', () => {
  const rind = rindMaterial(THREE);
  assert.equal(rind.vertexColors, true);
  assert.equal(rind.bumpMap, null, 'no page here: no grain, and no crash');
});

test('a tube follows its spine, ends in a tip where the radius is 0 and may be ridged', () => {
  const [hat] = validShapes([{ kind: 'tube', path: [[0, 0, 0], [0, 3, 0], [2, 5, 0]], radius: [2, 1, 0] }]);
  const box = whole(tubeGeometry(THREE, hat));
  assert.ok(near(box.min.x, -2, 0.05) && near(box.max.z, 2, 0.05) && near(box.min.z, -2, 0.05), 'the base is 2 wide all around');
  assert.ok(near(box.min.y, 0, 0.05) && near(box.max.y, 5, 0.05) && near(box.max.x, 2, 0.15), 'it ends at the last point');
  const [stem] = validShapes([{ kind: 'tube', path: [[0, 0, 0], [0, 4, 0]], radius: 1, ridges: 6, ridge: 0.3 }]);
  const ridged = tubeGeometry(THREE, stem);
  whole(ridged);
  const p = ridged.attributes.position;
  const reach = [];
  for (let i = 0; i < p.count; i += 1) if (Math.abs(p.getY(i) - 2) < 0.3) reach.push(Math.hypot(p.getX(i), p.getZ(i)));
  assert.ok(near(Math.max(...reach), 1, 1e-6) && near(Math.min(...reach), 0.7, 1e-6), 'grooves 30% deep, crests untouched');
  assert.ok(outward(ridged, (x, y, z) => (y > 0.01 && y < 3.99 ? [x, 0, z] : [0, 0, 0])) > 0.99);
});

test('a band goes around a stretch of the tube, a little above its surface', () => {
  const [cone] = validShapes([{ kind: 'tube', path: [[0, 0, 0], [0, 10, 0]], radius: [4, 2],
    bands: [{ span: [0.1, 0.3], lift: 0.2, color: '#7b3fc4', finish: 'satin' }] }]);
  const box = whole(bandGeometry(THREE, cone, cone.bands[0]));
  assert.ok(near(box.min.y, 1, 1e-6) && near(box.max.y, 3, 1e-6), 'from 10% to 30% of the spine');
  assert.ok(box.max.x > 3.9 && box.max.x < 4.2, 'the cone\'s radius there, plus the lift');
});

test('a lathe turns the profile around and looks outward whichever way the profile was written', () => {
  const profile = [[0, 0], [3, 0], [3.5, 0.3], [3, 0.6], [0, 0.6]];
  const [up] = validShapes([{ kind: 'lathe', profile }]);
  const [down] = validShapes([{ kind: 'lathe', profile: [...profile].reverse() }]);
  for (const shape of [up, down]) {
    const geometry = latheGeometry(THREE, shape);
    const box = whole(geometry);
    assert.ok(near(box.max.x, 3.5, 0.1) && near(box.min.z, -3.5, 0.1));
    assert.ok(outward(geometry, (x, y, z) => [x, (y - 0.3) * 4, z]) > 0.95);
  }
  const [wavy] = validShapes([{ kind: 'lathe', profile, wave: [1, 2, 0] }]);
  const waved = whole(latheGeometry(THREE, wavy));
  assert.ok(waved.max.y > 1 && waved.min.y < -0.4, 'the rim goes up and down');
});

test('a plate is the outline with a thickness, centred, never wider for its bevel; a hole goes through', () => {
  const outline = [[-2, -1], [2, -1], [2, 1], [-2, 1]];
  const [plain, ring] = validShapes([
    { kind: 'plate', outline, depth: 0.6 },
    { kind: 'plate', outline, hole: [[-1, -0.5], [1, -0.5], [1, 0.5], [-1, 0.5]], depth: 0.6, bevel: 0.2, round: 0.3 },
  ]);
  for (const shape of [plain, ring]) {
    const box = whole(plateGeometry(THREE, shape));
    assert.ok(near(box.max.x, 2, 1e-6) && near(box.min.y, -1, 1e-6), 'the outline\'s size');
    assert.ok(near(box.max.z, 0.3, 1e-6) && near(box.min.z, -0.3, 1e-6), 'the depth, half to each side');
  }
  const p = plateGeometry(THREE, ring).attributes.position;
  let inHole = 0;
  for (let i = 0; i < p.count; i += 1) if (Math.abs(p.getX(i)) < 0.6 && Math.abs(p.getY(i)) < 0.2) inHole += 1;
  assert.equal(inHole, 0, 'nothing in the middle of the hole');
});

test('shapes become meshes in a group: placed, turned, with the part\'s look unless they have their own', () => {
  const finish = createFinishes(THREE);
  const shapes = validShapes([
    { kind: 'tube', path: [[0, 0, 0], [0, 2, 0]], radius: 1, bands: [{ span: [0.2, 0.6], color: '#7b3fc4', finish: 'satin' }] },
    { kind: 'plate', outline: [[0, 0], [1, 0], [1, 1]], at: [1, 2, 3], turn: [90, 0, 0], color: '#f2b21c', finish: 'metal' },
  ]);
  const group = buildShapes(THREE, finish, shapes, { color: '#2b2331', finish: 'leather' });
  assert.equal(group.children.length, 2);
  const [tube, plate] = group.children;
  assert.equal(tube.children.length, 2, 'the tube and its band');
  assert.equal(tube.children[0].material, finish('leather', '#2b2331'), 'the part\'s look, one material for all that share it');
  assert.equal(tube.children[1].material, finish('satin', '#7b3fc4'));
  assert.ok(tube.children[0].castShadow && tube.children[0].receiveShadow);
  assert.deepEqual(plate.position.toArray(), [1, 2, 3]);
  assert.ok(near(plate.rotation.x, Math.PI / 2, 1e-9));
  assert.equal(plate.children[0].material.metalness, 1);
  assert.notEqual(finish('leather', '#2b2331'), finish('leather', '#000000'));
  assert.equal(finish('matte', '#ffffff', '#ff0000').emissive.getHexString(), 'ff0000', 'a glow lights the piece itself');
  assert.ok(finish('no-such-finish', '#ffffff').isMeshPhysicalMaterial, 'an unknown finish is plain plastic');
  assert.equal(buildShapes(THREE, finish, validShapes([{ kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 1 }])).children[0].children[0].material,
    finish('plastic', '#ffffff'), 'no look at all: white plastic');
});

test('the carved mouth: a hole marked in the stencil, a lit room behind it, and a body that leaves the hole open', () => {
  const carve = carveOf({ outline: [[-4, 1], [4, 1], [3, -1], [-3, -1]], depth: 1, glow: ['#ffee44', '#ffa51a'] });
  const mouth = carveMouth(THREE, carve, (y) => 0.8 - y * y);
  const [portal, back, walls] = mouth.group.children;
  assert.equal(portal.material.colorWrite, false, 'the hole itself paints nothing');
  assert.equal(portal.material.stencilZPass, THREE.ReplaceStencilOp);
  assert.ok(portal.renderOrder < back.renderOrder && back.renderOrder < 0, 'the hole, then the room, then everything else');
  assert.equal(walls.renderOrder, back.renderOrder);
  for (const mesh of [back, walls]) assert.equal(mesh.material.stencilFunc, THREE.EqualStencilFunc, 'the room shows only through the hole');
  const hole = whole(portal.geometry);
  assert.ok(near(hole.max.x, 0.4, 0.02) && near(hole.max.y, 0.1, 0.02), 'voxels became units (the corners a little rounded)');
  assert.ok(near(hole.max.z, 0.8 - 0.01, 0.02), 'the outline lies on the body\'s front');
  const strip = walls.geometry.attributes.position;
  let deepest = Infinity;
  for (let i = 0; i < strip.count; i += 1) deepest = Math.min(deepest, strip.getZ(i));
  assert.ok(near(deepest, 0.8 - 0.01 - 0.1, 1e-6), 'the walls go one voxel in');
  assert.ok(near(back.position.z, deepest, 1e-6), 'and the lit back closes them');
  mouth.light(0.5);
  assert.equal(back.material.color.r, 0.5, 'the candle dims');

  const body = new THREE.MeshPhysicalMaterial();
  mouth.mask(body);
  assert.deepEqual([body.stencilWrite, body.stencilFunc], [true, THREE.NotEqualStencilFunc]);
  unmask(body);
  assert.equal(body.stencilWrite, false, 'with the skin off the body is whole again');
  assert.equal(carveMouth(THREE, carve).group.children.length, 3, 'a flat front by default');
});

test('a closed tube is a ring: no ends, the last ring of points sits on the first, and it shades as one', () => {
  const circle = Array.from({ length: 12 }, (_, i) => [3 * Math.cos((i * Math.PI) / 6), 3 * Math.sin((i * Math.PI) / 6), 0]);
  const [ring] = validShapes([{ kind: 'tube', path: circle, radius: 0.3, closed: true }]);
  const geometry = tubeGeometry(THREE, ring);
  const box = whole(geometry);
  assert.ok(near(box.max.x, 3.3, 0.05) && near(box.min.y, -3.3, 0.05) && near(box.max.z, 0.3, 0.02), 'a ring of radius 3, 0.3 thick');
  const p = geometry.attributes.position;
  const n = geometry.attributes.normal;
  const columns = 28;
  const lastRow = p.count - (columns + 1);
  for (let c = 0; c <= columns; c += 1) {
    assert.ok(near(p.getX(c), p.getX(lastRow + c), 1e-6) && near(p.getY(c), p.getY(lastRow + c), 1e-6), 'it closes exactly');
    assert.ok(near(n.getX(c), n.getX(lastRow + c), 1e-6) && near(n.getZ(c), n.getZ(lastRow + c), 1e-6), 'no line where it closes');
  }
  let centre = 0;
  for (let i = 0; i < p.count; i += 1) if (Math.hypot(p.getX(i), p.getY(i)) < 2) centre += 1;
  assert.equal(centre, 0, 'no cap across the middle');
});

test('a mirrored shape is built twice, the second one on the other side as in a mirror; a lens is see-through', () => {
  const finish = createFinishes(THREE);
  const shapes = validShapes([
    { kind: 'plate', outline: [[0, 0], [2, 0], [2, 1]], at: [6, 1, 0], turn: [10, 20, 30], mirror: true, finish: 'gloss', color: '#0d0d10' },
    { kind: 'lathe', profile: [[0, -0.1], [3, -0.1], [3, 0.1], [0, 0.1]], finish: 'glass', color: '#bfe3ff' },
  ]);
  const group = buildShapes(THREE, finish, shapes);
  assert.equal(group.children.length, 3, 'two lenses and one disc');
  const [right, left, disc] = group.children;
  assert.deepEqual(right.position.toArray(), [6, 1, 0]);
  assert.deepEqual(left.position.toArray(), [-6, 1, 0]);
  assert.deepEqual([right.scale.x, left.scale.x], [1, -1]);
  assert.ok(near(left.rotation.x, right.rotation.x, 1e-9) && near(left.rotation.y, -right.rotation.y, 1e-9)
    && near(left.rotation.z, -right.rotation.z, 1e-9));
  assert.equal(left.children[0].geometry, right.children[0].geometry, 'one geometry for both');
  assert.equal(left.children[0].material, right.children[0].material);
  assert.ok(right.children[0].material.clearcoat === 1 && right.children[0].material.roughness < 0.2, 'polished');
  const glass = disc.children[0].material;
  assert.ok(glass.transparent && glass.opacity < 0.5 && glass.depthWrite === false, 'what is behind a lens still shows');
});

test('hair and dark lenses: soft strands with a sheen, lenses dark enough to hide the eye but not quite', () => {
  const finish = createFinishes(THREE);
  const hair = finish('hair', '#2a1b14');
  assert.ok(hair.roughness > 0.5 && hair.sheen > 0, 'soft, with a sheen');
  assert.equal(hair.bumpMap, null, 'no page here: no strands drawn, and no crash');
  const lens = finish('tinted', '#1b2229');
  assert.ok(lens.transparent && lens.opacity > 0.7 && lens.opacity < 1 && lens.depthWrite === false);
});

test('the eyes a scene asks for are smooth pieces, mirrored on the right eye, about the size of the eye', async () => {
  const { buildEye, EYE_FORMS } = await import('../../web/js/eyes3d.js');
  const { EYE_SHAPE_NAMES } = await import('../../web/js/eyeshapes.js');
  assert.deepEqual(Object.keys(EYE_FORMS).sort(), [...EYE_SHAPE_NAMES].sort(), 'every glyph of the 2D face has its 3D form');
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d });
  for (const name of EYE_SHAPE_NAMES) {
    const left = buildEye(THREE, name, black, 0);
    const right = buildEye(THREE, name, black, 1);
    assert.equal(left.scale.x, 1);
    assert.equal(right.scale.x, -1, `${name}: the right eye is the mirror image`);
    const size = new THREE.Box3().setFromObject(left).getSize(new THREE.Vector3());
    assert.ok(size.x > 0.1 && size.x < 0.5 && size.y > 0.25 && size.y < 0.55, `${name}: ${size.x.toFixed(2)} x ${size.y.toFixed(2)}`);
    assert.ok(size.z < 0.1, `${name}: a thin piece on the face`);
    left.traverse((o) => {
      if (!o.isMesh) return;
      assert.equal(o.material, black, 'the same plastic as the bars');
      for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
    });
  }
  assert.equal(buildEye(THREE, 'square', black), null, 'an unknown name builds nothing');
});
