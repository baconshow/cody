// scenes3d.js — draws the scenes of web/scenes/scenes.json around the 3D mascot. Every piece is a box from one shared
// geometry, with one material per color; a sign is a box with its text painted on a small canvas. A scene grows in
// when it starts and shrinks away when it ends; its clips (bob, blink, dots, steam, walk, confetti, sway) stop with
// "reduce motion", where the scene just appears.
//
// A part is either around the mascot (the monitor, the confetti: it stands still in the room) or worn by it (the
// nightcap, the headphones: "on": "body"). Worn parts live in a second group that goes on the mascot's body, so they
// turn, hop, tilt and breathe with it instead of floating where the head used to be.
//
//   createScenes3d(THREE, data) → { group, worn, update(q, sceneId), span(sceneId) }
//     group   what stands around the mascot (add it to the room)
//     worn    what the mascot wears (hand it to mascot.wear)
//     span    [left, right] in units: how far the scene reaches to each side (scenes.js sceneSpan), for the camera

import { anchorOf, pivotOf, sceneSpan } from './scenes.js';

const V = 0.1;                    // units per voxel, as in mascot3d.js
const GROW = 6;                   // how fast a scene grows in or out (per second)
const NO_SPAN = Object.freeze([0, 0]);

const CLIPS = {
  bob: (o, t) => { o.position.y = Math.sin(t * 4) * 0.02; },
  blink: (o, t, i) => { o.visible = Math.floor(t * 2 + i * 0.7) % 4 !== 0; },
  dots: (o, t, i) => { o.scale.setScalar(Math.floor(t * 2.5) % 4 > i ? 1 : 0.001); },
  steam: (o, t, i) => {                                // each puff rises and thins out where it is
    const k = (t * 0.6 + i / 3) % 1;
    const puff = o.children[0];
    o.position.y = k * 0.25;
    puff.scale.copy(puff.userData.size).multiplyScalar(1 - k * 0.7);
  },
  walk: (o, t) => { o.position.x = Math.sin(t * 1.3) * 0.5; o.position.y = Math.abs(Math.sin(t * 9)) * 0.02; },
  confetti: (o, t, i) => { const k = (t * 0.35 + i * 0.17) % 1; o.position.y = -k * 2.2; o.children[0].rotation.z = t * (2 + i); },
  sway: (o, t) => { o.rotation.z = Math.sin(t * 1.1 - 0.6) * 0.05; },   // in time with the sleeping breath, a little late
};

function signTexture(THREE, lines, ink) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0f1a14';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = ink || '#7dff9b';
  g.font = 'bold 26px ui-monospace, Consolas, monospace';
  lines.slice(0, 4).forEach((line, i) => g.fillText(String(line).slice(0, 18), 14, 42 + i * 38));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScenes3d(THREE, data) {
  const group = new THREE.Group();
  const worn = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
    return materials.get(color);
  };
  const box = (b, mat) => {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(b[0] * V, b[1] * V, b[2] * V);
    mesh.scale.set(b[3] * V, b[4] * V, b[5] * V);
    mesh.userData.size = mesh.scale.clone();
    return mesh;
  };
  const built = new Map();
  for (const scene of data) {
    const roots = { world: new THREE.Group(), body: new THREE.Group() };
    const animated = [];
    const holders = [];                    // worn parts grow in place, from their pivot
    for (const part of scene.parts) {
      const anchor = anchorOf(part);
      const root = roots[anchor];
      if (part.sign && Array.isArray(part.box)) {
        root.add(box(part.box, new THREE.MeshBasicMaterial({ map: signTexture(THREE, part.sign, part.ink) })));
        continue;
      }
      const at = pivotOf(part);
      const holder = new THREE.Group();
      holder.position.set(at[0] * V, at[1] * V, at[2] * V);
      (part.boxes || []).forEach((b, i) => {
        const pivot = new THREE.Group();
        pivot.add(box([b[0] - at[0], b[1] - at[1], b[2] - at[2], b[3], b[4], b[5]], material(part.color || '#ffffff')));
        holder.add(pivot);
        if (CLIPS[part.clip]) animated.push({ o: pivot, clip: CLIPS[part.clip], i });
      });
      root.add(holder);
      if (anchor === 'body') holders.push(holder);
    }
    roots.world.visible = roots.body.visible = false;
    roots.world.scale.setScalar(0.001);
    group.add(roots.world);
    worn.add(roots.body);
    built.set(scene.id, { roots, holders, animated, grow: 0, span: sceneSpan(scene) });
  }

  let last = null;
  function update(q, sceneId, dt = 1 / 60) {
    for (const [id, s] of built) {
      const target = id === sceneId ? 1 : 0;
      s.grow = q.quiet ? target : Math.max(0, Math.min(1, s.grow + Math.sign(target - s.grow) * GROW * dt));
      s.roots.world.visible = s.roots.body.visible = s.grow > 0.001;
      if (!s.roots.world.visible) continue;
      const size = Math.max(0.001, s.grow);
      s.roots.world.scale.setScalar(size);
      for (const holder of s.holders) holder.scale.setScalar(size);
      if (!q.quiet) for (const a of s.animated) a.clip(a.o, q.time || 0, a.i);
    }
    const changed = sceneId !== last;
    last = sceneId;
    return changed;
  }

  return { group, worn, update, span: (id) => built.get(id)?.span ?? NO_SPAN };
}
