// The 3D figure wearing a skin (web/js/mascot3d.js, scenes3d.js), built with the real three.js and the real
// skins.json: the pumpkin swaps the box for a gourd, the leaves for a stem and cuts its mouth through the front;
// taking it off puts every piece back. A page is only needed for the small canvases, so a stand-in is enough.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../web/vendor/three/build/three.module.js';
import { createMascot } from '../../web/js/mascot3d.js';
import { createScenes3d } from '../../web/js/scenes3d.js';
import { createAnimator } from '../../web/js/animator.js';
import { validSkins, skinScene, skinNamed } from '../../web/js/skins.js';
import { seededRandom } from '../../web/js/seeded-random.js';

globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };   // no drawing here
class Rounded extends THREE.BoxGeometry {                 // the rounded box of the page, without its rounding
  constructor(width, height, depth) { super(width, height, depth); }
}

const skins = validSkins(JSON.parse(readFileSync(new URL('../../web/skins/skins.json', import.meta.url))));
const pumpkin = skinNamed(skins, 'halloween');
const pose = (talk = 0) => ({ ...createAnimator({ random: seededRandom(3), mood: 'listening', quiet: true }).step(0), talk });
const meshes = (group) => { const found = []; group.traverse((o) => { if (o.isMesh) found.push(o); }); return found; };

// the body group holds the torso; its pieces are found by what they are made of
function look(mascot) {
  const all = meshes(mascot.root);
  return {
    box: all.find((m) => m.geometry instanceof Rounded && m.geometry.parameters.width > 2),
    gourd: all.find((m) => m.material.isMeshPhysicalMaterial && m.material.vertexColors),   // the rind, not the cut's walls
    hole: all.find((m) => m.material.colorWrite === false),
  };
}

test('the pumpkin skin swaps the box for a ribbed gourd, the leaves for a stem, and cuts the mouth open', () => {
  const mascot = createMascot(THREE, Rounded);
  const before = look(mascot);
  assert.ok(before.box.visible && !before.gourd && !before.hole, 'the classic figure: a box, nothing carved');
  const arms = meshes(mascot.root).filter((m) => m.geometry instanceof Rounded && m.geometry.parameters.depth === 0.52).map((m) => m.parent);
  assert.deepEqual(arms.map((a) => +a.position.x.toFixed(6)), [-1.2, 1.2]);

  const eyesBefore = mascot.eyes.y;
  mascot.recolor(pumpkin.colors);
  mascot.setSkin(pumpkin);
  const worn = look(mascot);
  assert.equal(worn.box.visible, false, 'the box is put away');
  assert.ok(worn.gourd.geometry.attributes.position.count > 5000, 'a real ribbed mesh');
  assert.equal(worn.gourd.material.color.getHexString(), pumpkin.colors.body.slice(1), 'in the skin\'s orange');
  assert.equal(worn.gourd.material.stencilWrite, true, 'the body leaves the mouth open');
  assert.ok(worn.hole, 'the hole is marked');
  assert.ok(arms[1].position.x < 1.2 && arms[0].position.x > -1.2, 'the arms moved in, onto the gourd');
  const sprout = meshes(mascot.root).filter((m) => m.material.color.g > m.material.color.r * 1.2 && m.material.color.g > m.material.color.b * 1.2);
  assert.ok(sprout.some((m) => m.visible && m.parent.parent.parent.visible && !(m.geometry instanceof Rounded)), 'the stem stands');
  assert.ok(sprout.filter((m) => m.geometry instanceof Rounded).every((m) => !m.visible), 'the two leaves are put away');

  // shorter legs: the whole figure stands lower, eyes and all
  const body = worn.gourd.parent;
  assert.ok(Math.abs(body.position.y - pumpkin.legs * 0.1) < 1e-9 && pumpkin.legs < 5, 'the body sits on shorter legs');
  assert.ok(mascot.eyes.y < eyesBefore, 'and the eyes are where the lower face is');

  // the stem is no antenna: it stands still while the old sprout would swing; only the tendril waves a little
  const leaf = meshes(mascot.root).find((m) => m.geometry instanceof Rounded && m.geometry.parameters.width === 0.22);
  const [stem, tendril] = leaf.parent.children.at(-1).children;
  mascot.pose({ ...pose(0), sproutX: 1, sproutY: 1 });
  assert.deepEqual([leaf.parent.rotation.z, leaf.parent.rotation.x], [0, 0], 'the pivot of the sprout does not swing');
  assert.deepEqual([stem.rotation.z, stem.rotation.x], [0, 0], 'the thick stem is still');
  assert.ok(tendril.rotation.z < 0 && tendril.rotation.z > -0.5 * 0.5, 'the tendril takes a small share of the swing');

  mascot.pose(pose(0));
  const closed = worn.hole.parent.scale.y;
  mascot.pose(pose(0.5));
  assert.ok(worn.hole.parent.scale.y > closed, 'the carved mouth opens taller with the voice');

  mascot.recolor({});
  mascot.setSkin(null);
  const after = look(mascot);
  assert.ok(after.box.visible && !after.gourd && !after.hole, 'the skin off: the box is back, nothing left over');
  assert.equal(after.box.material.stencilWrite, false);
  assert.deepEqual(arms.map((a) => +a.position.x.toFixed(6)), [-1.2, 1.2]);
  assert.ok(meshes(mascot.root).filter((m) => m.geometry instanceof Rounded && m.material.color.g > m.material.color.r * 1.2).every((m) => m.visible), 'the leaves are back');
  assert.ok(Math.abs(body.position.y - 0.5) < 1e-9 && mascot.eyes.y === eyesBefore, 'standing as tall as before');
  mascot.pose({ ...pose(0.5), sproutX: 1 });               // and it still moves: the sprout is an antenna again
  assert.equal(leaf.parent.rotation.z, -0.5);
});

test('a skin with a hole in a plain box body keeps the arms whole (only the torso is cut)', () => {
  const mascot = createMascot(THREE, Rounded);
  mascot.setSkin({ ...skinNamed(skins, 'classic'), carve: pumpkin.carve });
  const torso = look(mascot).box;
  assert.equal(torso.material.stencilWrite, true);
  const arm = meshes(mascot.root).find((m) => m.geometry instanceof Rounded && m.geometry.parameters.depth === 0.52);
  assert.notEqual(arm.material, torso.material);
  assert.equal(arm.material.stencilWrite, false);
});

test('the shop\'s skins build as worn scenes: the witch hat is a tilted brim, a bent cone with its band, and a buckle', () => {
  const scenes = createScenes3d(THREE, skins.map(skinScene).filter(Boolean));
  assert.equal(scenes.update({ quiet: true, time: 0 }, null, 0, null, 'skin:halloween'), false, 'a skin is not a change of scene');
  const shown = scenes.worn.children.filter((c) => c.visible);
  assert.equal(shown.length, 1, 'only the skin that is worn shows');
  const hat = shown[0].children[0];
  assert.ok(Math.abs(hat.rotation.z) > 0.1, 'it sits crooked');
  const pieces = meshes(hat);
  assert.equal(pieces.length, 4, 'brim, cone, band, buckle');
  assert.equal(new Set(pieces.map((m) => m.material)).size, 3, 'leather twice, satin, gold');
  assert.ok(pieces.some((m) => m.material.metalness === 1), 'the buckle is metal');
  for (const m of pieces) for (const v of m.geometry.attributes.position.array) assert.ok(Number.isFinite(v));
  assert.deepEqual(scenes.span('skin:halloween'), [0, 0], 'what is worn does not widen the picture');
  scenes.update({ quiet: true, time: 0 }, null, 0, null, 'skin:aviator');
  assert.deepEqual(scenes.worn.children.filter((c) => c.visible).length, 1);
  assert.ok(meshes(scenes.worn.children.find((c) => c.visible)).length > 10, 'the box skins still build');
});
