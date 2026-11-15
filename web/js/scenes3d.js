// scenes3d.js — draws the scenes of web/scenes/scenes.json around the 3D mascot. Every piece is a box from one shared
// geometry, with one material per color; a sign is a box with its text painted on a small canvas; a part may also
// carry "shapes" (forms.js: a tube, a lathe, a plate, measured from the part's pivot) and a "tilt" (degrees about
// the pivot), which is how a skin's hat gets a bent tip and sits crooked. A scene grows in
// when it starts and shrinks away when it ends; its clips (bob, blink, dots, steam, walk, confetti, sway) stop with
// "reduce motion", where the scene just appears.
//
// A part is either around the mascot (the monitor, the confetti: it stands still in the room) or worn by it (the
// nightcap, the headphones: "on": "body"). Worn parts live in a second group that goes on the mascot's body, so they
// turn, hop, tilt and breathe with it instead of floating where the head used to be. A worn part may say which
// place it takes ("slot": "hat"): a skin's piece in a slot gives way while the scene of the moment (or the one
// worn over it) puts something in the same slot, so a nightcap does not go through a witch hat. A worn part may also
// get out of an arm's way ("lift": { "arm": "left" | "right", "turn": [x, y, z] degrees, "move": [x, y, z] voxels }):
// while that arm types, waves, knocks or grabs, the part turns and moves that far (a headphone cup swung up off the
// ear), and settles back after; with "reduce motion" it jumps there instead of moving.
//
//   createScenes3d(THREE, data, finish) → { group, worn, update(q, sceneId, dt, overId, skinId), span(sceneId) }
//     data    the scenes, plus the skins' pieces as scenes (skins.js skinScene); a part may glow ("glow": a color)
//     group   what stands around the mascot (add it to the room)
//     worn    what the mascot wears (hand it to mascot.wear)
//     update  shows the scene (and the one worn over it, overId: the headphones, and the skin's pieces, skinId);
//             true when the scene changed
//     span    [left, right] in units: how far the scene reaches to each side (scenes.js sceneSpan), for the camera
//   armBusy(q, arm) → 0 to 1: how much an arm is out of its resting place (the animator's pose), for "lift"

import { anchorOf, pivotOf, sceneSpan } from './scenes.js';
import { validShapes } from './forms.js';
import { createFinishes, buildShapes } from './forms3d.js';

const V = 0.1;                    // units per voxel, as in mascot3d.js
const GROW = 6;                   // how fast a scene grows in or out (per second)
const NO_SPAN = Object.freeze([0, 0]);
const RAD = Math.PI / 180;
const LIFT_SPEED = 7;             // how fast a lifted part follows its arm (per second)
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const three = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : [0, 0, 0]);

// an arm away from its resting place: typing (both hands on the keys), grabbing the screen's edges, knocking (the
// right one), or raised and stretched (each its own). A small raise (listening, the gestures of talking) keeps the
// ear inside a headphone cup: only past RAISE.from does it count, and by RAISE.from + RAISE.span it counts fully
const RAISE = Object.freeze({ from: 0.22, span: 0.15 });
export function armBusy(q, arm) {
  const left = arm === 'left';
  const typing = q?.prop === 'keyboard' ? clamp01(q.hold) : 0;
  const knock = left ? 0 : clamp01(q?.knock);
  const raise = clamp01(((left ? q?.raiseL : q?.raiseR) - RAISE.from) / RAISE.span);
  const stretch = clamp01((left ? q?.stretchL : q?.stretchR) * 2);
  return Math.max(typing, clamp01(q?.grab), knock, raise, stretch);
}

function liftOf(part) {
  const lift = part?.lift;
  if (!lift || typeof lift !== 'object') return null;
  return { arm: lift.arm === 'left' ? 'left' : 'right', turn: three(lift.turn).map((d) => d * RAD), move: three(lift.move).map((v) => v * V) };
}

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

export function createScenes3d(THREE, data, finish = createFinishes(THREE)) {
  const group = new THREE.Group();
  const worn = new THREE.Group();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map();
  const material = (color, glow = null) => {
    const key = glow ? `${color}+${glow}` : color;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...(glow ? { emissive: glow, emissiveIntensity: 0.9 } : {}) }));
    }
    return materials.get(key);
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
    const slots = new Set();               // the places its worn parts take
    const lifted = [];                     // worn parts that get out of an arm's way
    for (const part of scene.parts) {
      const anchor = anchorOf(part);
      const root = roots[anchor];
      if (part.sign && Array.isArray(part.box)) {
        const b = part.box;                // a sign is its own holder, at its middle: worn, it grows in place too
        const holder = new THREE.Group();
        holder.position.set(b[0] * V, b[1] * V, b[2] * V);
        holder.add(box([0, 0, 0, b[3], b[4], b[5]], new THREE.MeshBasicMaterial({ map: signTexture(THREE, part.sign, part.ink) })));
        root.add(holder);
        if (anchor === 'body') holders.push(holder);
        continue;
      }
      const at = pivotOf(part);
      const holder = new THREE.Group();
      holder.position.set(at[0] * V, at[1] * V, at[2] * V);
      if (Array.isArray(part.tilt) && part.tilt.length === 3 && part.tilt.every(Number.isFinite)) {
        holder.rotation.set(part.tilt[0] * RAD, part.tilt[1] * RAD, part.tilt[2] * RAD);
      }
      const shapes = validShapes(part.shapes);
      if (shapes.length) {
        const made = buildShapes(THREE, finish, shapes, part);
        made.scale.setScalar(V);                           // shapes are in voxels, from the pivot
        holder.add(made);
      }
      (part.boxes || []).forEach((b, i) => {
        const pivot = new THREE.Group();
        pivot.add(box([b[0] - at[0], b[1] - at[1], b[2] - at[2], b[3], b[4], b[5]], material(part.color || '#ffffff', part.glow || null)));
        holder.add(pivot);
        if (CLIPS[part.clip]) animated.push({ o: pivot, clip: CLIPS[part.clip], i });
      });
      root.add(holder);
      if (anchor === 'body') {
        holders.push(holder);
        if (typeof part.slot === 'string') { holder.userData.slot = part.slot; holder.userData.kept = 1; slots.add(part.slot); }
        const lift = liftOf(part);
        if (lift) {
          holder.userData.lift = { ...lift, now: 0, at: holder.position.clone(), rest: holder.rotation.clone() };
          lifted.push(holder);
        }
      }
    }
    roots.world.visible = roots.body.visible = false;
    roots.world.scale.setScalar(0.001);
    group.add(roots.world);
    worn.add(roots.body);
    built.set(scene.id, { roots, holders, animated, slots, lifted, grow: 0, span: sceneSpan(scene) });
  }

  let last = null;
  function update(q, sceneId, dt = 1 / 60, overId = null, skinId = null) {
    // the slots the scene and what is worn over it take: the skin's pieces in them step aside
    const taken = new Set([...(built.get(sceneId)?.slots ?? []), ...(built.get(overId)?.slots ?? [])]);
    for (const [id, s] of built) {
      const target = id === sceneId || id === overId || id === skinId ? 1 : 0;
      s.grow = q.quiet ? target : Math.max(0, Math.min(1, s.grow + Math.sign(target - s.grow) * GROW * dt));
      s.roots.world.visible = s.roots.body.visible = s.grow > 0.001;
      if (!s.roots.world.visible) continue;
      const size = Math.max(0.001, s.grow);
      s.roots.world.scale.setScalar(size);
      for (const holder of s.holders) {
        const data = holder.userData;
        if (data.slot) {
          const want = id === skinId && id !== sceneId && id !== overId && taken.has(data.slot) ? 0 : 1;
          data.kept = q.quiet ? want : Math.max(0, Math.min(1, data.kept + Math.sign(want - data.kept) * GROW * dt));
        }
        holder.scale.setScalar(Math.max(0.001, size * (data.slot ? data.kept : 1)));
      }
      for (const holder of s.lifted) {
        const lift = holder.userData.lift;
        const want = armBusy(q, lift.arm);
        lift.now = q.quiet ? want : lift.now + (want - lift.now) * Math.min(1, LIFT_SPEED * dt);
        holder.rotation.set(lift.rest.x + lift.turn[0] * lift.now, lift.rest.y + lift.turn[1] * lift.now, lift.rest.z + lift.turn[2] * lift.now);
        holder.position.set(lift.at.x + lift.move[0] * lift.now, lift.at.y + lift.move[1] * lift.now, lift.at.z + lift.move[2] * lift.now);
      }
      if (!q.quiet) for (const a of s.animated) a.clip(a.o, q.time || 0, a.i);
    }
    const changed = sceneId !== last;
    last = sceneId;
    return changed;
  }

  return { group, worn, update, span: (id) => built.get(id)?.span ?? NO_SPAN };
}
