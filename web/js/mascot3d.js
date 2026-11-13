// mascot3d.js — the voxel mascot in 3D, like a small collectible vinyl figure: satin orange plastic with rounded
// corners, glossy black plastic eyes set into the front (with the reflection in the corner), the ears that are the
// little arms, four legs (the outer ones in front, the inner ones set back) and the sprout on the head. The sizes
// come from the voxel drawing (measures.js), at 0.1 unit per voxel; the front faces +z and the floor is y = 0.
//
//   createMascot(THREE, RoundedBoxGeometry) → { root, eyes: THREE.Vector3 (the middle of the eyes, on the figure), pose(q),
//                                              wear(group), unwear(group), recolor(colors), setSkin(skin) }
//     setSkin(skin) a skin's looks (skins.js): smile (the ^ eyes always), mouth (false hides the talking mouth),
//                   body (a ribbed gourd instead of the box), sprout (its own stem instead of the two leaves)
//                   carve (a mouth cut through the front, lit from inside) and legs (their height in voxels:
//                   the whole figure stands lower); forms3d.js builds the shapes
//     wear(group)   puts a group on the body, so it turns, hops and breathes with it (a cap, headphones: scenes3d.js);
//                   the group keeps measuring from the floor under the mascot's middle, like everything else
//     pose(q)   applies the animator's pose (animator.js): gaze, blink, breathing, hop, tilt, arms, sprout, blush,
//               talk, the happy face (^ eyes), the touch recoil, turning sideways (the body by q.yaw, the legs
//               walking after it by q.feet, so they never stay behind), thinking with one front leg up in the
//               air (q.lift) and the prop in hand: the magnifier in front of the right eye, which grows huge
//               behind the lens, or the keyboard, with the hands coming down on the keys; and grabbing (phone
//               shaking): arms stretched to the screen edges, legs spread, eyes wide, mouth open and the body
//               trembling

import { BODY, LEG, EYE, CHEEK, ARM, PX, BOOST } from './measures.js';
import { buildEye } from './eyes3d.js';
import { createKeyboard, KEYBOARD } from './keyboard3d.js';
import { createFinishes, buildShapes, gourdGeometry, rindMaterial, carveMouth, unmask, tubeGeometry, plateGeometry } from './forms3d.js';
import { gourdScale, validShapes } from './forms.js';

const V = 0.1;                                           // units per voxel
const DEPTH = 1.6;                                       // the body's depth (the drawing is front-only)
const COLOR = Object.freeze({
  body: 0xf26a10, leg: 0xd85a0c, eye: 0x0b0b0d, glint: 0xffffff, blush: 0xff8f86, mouth: 0x2a1418,
  stem: 0x4f8a2c, leaf: 0x47b33a,
});
const LOOK = Object.freeze({ turnX: 0.14, eyeX: 0.1, eyeY: 0.07 });   // radians and units (the turn is q.yaw)
const STEP = Object.freeze({ lift: 0.07, rhythm: 16 });   // the legs walking around: how high, how fast
const BREATH = 0.018;
// a carved mouth (a skin's): it opens a little taller with the voice, and its light wavers like a candle's
const CARVED = Object.freeze({ talk: 0.22, waver: 0.07, rhythm: 7.3 });
const HIP = 0.4;                                         // how far a leg goes up into the body (a round belly hides less of it)
const ARM_RAISE = 1.25;                                  // radians at raise = 1
const SLEEPY_LID = 0.5;                                  // when sleepy, the eye stays half closed
const RECOIL = Object.freeze({ move: 0.8, tip: 0.5, side: 0.45 });   // per unit of the recoil spring
// the arms on the keyboard: out nearly flat (forward, radians), a little inward and thinner as they stretch, so the
// hand's lower edge rests on the keys instead of going through them (the keyboard's tilt is in keyboard3d.js);
// each hand lifts (radians) in its turn, to KEYBOARD.rhythm
const TYPING = Object.freeze({ forward: 1.3, lift: 0.14, inward: 0.25, stretch: 1.3, thin: 0.4 });
// thinking: the front leg opposite the thought bubble (which floats at the mascot's left, +x) comes up, pulled up
// into the body (units) and swung a little forward (radians), like a paw held up, and taps in the air now and
// then; a big swing looked like a leg splayed out from the front, the camera being so close
const LIFT = Object.freeze({ leg: 0, up: 0.14, swing: 0.55, tap: 0.12, rhythm: 2.6 });
const GRAB = Object.freeze({ stretch: 1.9, spread: 0.4, eye: 0.28, shake: 0.05, rhythm: 27 }); // the shake startle
// knocking on the screen (Claude needs you): the right arm comes up in front, stretched to reach the glass, and
// raps twice a second or so (toc-toc, a pause); the body leans toward the viewer. forward: the arm's swing
// (radians); inward: the forward arm turned across, so the fist is in front of the face; tap: the extra swing
// of a rap; lean and closer: the body (radians, units)
const KNOCK = Object.freeze({ forward: 1.25, inward: 0.45, stretch: 1.6, tap: 0.22, period: 1.1, lean: 0.08, closer: 0.2 });
// the swearing after a shake: the symbols come out one by one in the open mouth and jump about, comic-strip style
const CURSE = Object.freeze({ text: '&#$*%@!', colors: ['#ffd23f', '#ff6b5b', '#7ee081', '#6ec3ff', '#ff9de2'],
  width: 0.8, height: 0.3, typed: 0.4, fps: 12, fade: 0.85 });
const MAGNIFIER = Object.freeze({ radius: 0.42, rim: 0.05, forward: 0.17, eye: 0.6, rise: 0.8, arm: 0.12 });

const x = (vx) => (vx - BODY.width / 2) * V;            // drawing voxel → figure x

function materials(THREE) {
  const plastic = (color, roughness = 0.42) => new THREE.MeshPhysicalMaterial({
    color, roughness, clearcoat: 0.25, clearcoatRoughness: 0.45,
  });
  return {
    body: plastic(COLOR.body), leg: plastic(COLOR.leg, 0.5),
    torso: plastic(COLOR.body), rind: rindMaterial(THREE),   // the body's own: a carved mouth leaves a hole in it alone
    eye: new THREE.MeshPhysicalMaterial({ color: COLOR.eye, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    glint: new THREE.MeshBasicMaterial({ color: COLOR.glint }),
    blush: new THREE.MeshStandardMaterial({ color: COLOR.blush, roughness: 0.8, transparent: true, opacity: 0 }),
    mouth: new THREE.MeshPhysicalMaterial({ color: COLOR.mouth, roughness: 0.3, clearcoat: 0.6 }),
    stem: plastic(COLOR.stem, 0.55), leaf: plastic(COLOR.leaf, 0.5),
    handle: plastic(0x6b2f12, 0.5),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd8ecff, transparent: true, opacity: 0.16, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false,
    }),
  };
}

function box(THREE, Rounded, [w, h, d], radius, mat, shadow = true) {
  const mesh = new THREE.Mesh(new Rounded(w, h, d, 3, radius), mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  return mesh;
}

// the eye: the black plastic bar with the reflection in the top corner, the ^ of the happy face (two sticks), and
// the shapes a scene may ask for (♥, ×, > <...: eyes3d.js), smooth, of the same plastic, built the first time they show
function eye(THREE, Rounded, m, cx, side) {
  const group = new THREE.Group();
  const bar = box(THREE, Rounded, [EYE.width * V, EYE.height * V, 0.08], 0.03, m.eye, false);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), m.glint);
  glint.position.set(-0.045, EYE.height * V / 2 - 0.085, 0.042);
  bar.add(glint);
  const happy = new THREE.Group();
  for (const s of [-1, 1]) {
    const stick = box(THREE, Rounded, [0.2, 0.065, 0.08], 0.03, m.eye, false);
    stick.position.set(s * 0.07, 0, 0);
    stick.rotation.z = -s * 0.75;
    happy.add(stick);
  }
  happy.visible = false;
  group.add(bar, happy);
  group.position.set(x(cx), 0, DEPTH / 2 + 0.005);
  const shapes = new Map();
  const shape = (name) => {
    if (!shapes.has(name)) {
      const made = buildEye(THREE, name, m.eye, side);
      if (!made) return null;
      made.visible = false;
      group.add(made);
      shapes.set(name, made);
    }
    return shapes.get(name);
  };
  return { group, bar, happy, shape, shown: null };
}

// the magnifier: black plastic rim, the glass lens and the brown handle going down to the right hand. It lives in
// the face group, in front of the right eye, and comes up from below as the hold spring moves
function magnifier(THREE, Rounded, m) {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(MAGNIFIER.radius, MAGNIFIER.rim, 12, 48), m.eye);
  rim.castShadow = true;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(MAGNIFIER.radius, 48), m.glass);
  // the handle lies flat off the right side of the rim, at the height of the right hand, which holds it at the body's edge
  const handle = box(THREE, Rounded, [0.1, 0.5, 0.1], 0.035, m.handle);
  handle.position.set(MAGNIFIER.radius + 0.23, -0.07, 0);
  handle.rotation.z = Math.PI / 2;
  group.add(rim, lens, handle);
  group.position.set(x(EYE.xs[1] + EYE.width / 2), 0, DEPTH / 2 + MAGNIFIER.forward);
  group.visible = false;
  return group;
}

// the sprout: a stem that thins toward the top, a little bent, and two leaves, each a pointed oval with a soft
// edge, lying open and turned up toward the light. Measured in voxels (forms.js), like a skin's shapes
const SPROUT = Object.freeze({
  stem: { kind: 'tube', path: [[0, -0.6, 0], [0.12, 1.5, 0.05], [0, 3.15, 0]], radius: [0.42, 0.34, 0.27] },
  leaf: { kind: 'plate', outline: [[0, 0], [0.45, 0.42], [1.2, 0.6], [1.95, 0.42], [2.5, 0], [1.95, -0.36], [1.2, -0.5], [0.45, -0.36]],
    depth: 0.16, bevel: 0.06, round: 0.35 },
  leafAt: [0.12, 3.05, 0], tilt: 30, lean: 38,
});

function sprout(THREE, m) {
  const pivot = new THREE.Group();
  const [stemShape, leafShape] = validShapes([SPROUT.stem, SPROUT.leaf]);
  const stem = new THREE.Mesh(tubeGeometry(THREE, stemShape), m.stem);
  const leafGeometry = plateGeometry(THREE, leafShape);
  const parts = [stem];
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeometry, m.leaf);
    leaf.position.set(SPROUT.leafAt[0] * s, SPROUT.leafAt[1], SPROUT.leafAt[2]);
    // its face toward the viewer, the tip turned up and the leaf leaning back a little, like a real seedling's
    leaf.rotation.set(-SPROUT.lean * Math.PI / 180, 0, s * SPROUT.tilt * Math.PI / 180);
    leaf.scale.x = s;                                      // the left one is the mirror image
    parts.push(leaf);
  }
  for (const part of parts) {
    part.castShadow = part.receiveShadow = true;
    part.scale.multiplyScalar(V);
    part.position.multiplyScalar(V);
    pivot.add(part);
  }
  pivot.position.set(x(9), BODY.height * V, 0.1);
  return pivot;
}

function arm(THREE, Rounded, m, s) {
  const shoulder = new THREE.Group();
  const piece = box(THREE, Rounded, [ARM.out * V, ARM.height * V, 0.52], 0.07, m.body);
  piece.position.set(s * ARM.out * V / 2, -ARM.height * V / 2, 0);
  shoulder.add(piece);
  shoulder.position.set(s * BODY.width * V / 2, (BODY.height - ARM.top) * V, 0);
  shoulder.rotation.order = 'YXZ';                     // out to the side (z), then forward (x), then across (y): the knock
  return shoulder;
}

export function createMascot(THREE, Rounded) {
  const m = materials(THREE);
  const root = new THREE.Group();
  const spring = new THREE.Group();                      // hop and tilt
  const body = new THREE.Group();                        // on top of the legs; breathes and turns toward the gaze
  const feet = new THREE.Group();                        // the four legs: they turn together, under the body
  root.add(spring);
  spring.add(feet);
  // each leg on a pivot at its top (where it joins the body), so it can spread on a startle without leaving the body
  const legs = LEG.xs.map((vx, i) => {
    const pivot = new THREE.Group();
    const leg = box(THREE, Rounded, [LEG.width * V, LEG.height * V + 0.06 + HIP, 0.4], 0.05, m.leg);
    leg.position.y = -LEG.height * V / 2 + HIP / 2;
    pivot.add(leg);
    const inner = i === 1 || i === 2;
    pivot.position.set(x(vx + LEG.width / 2), LEG.height * V, inner ? -0.3 : 0.35);
    feet.add(pivot);
    return pivot;
  });
  body.position.y = LEG.height * V;
  spring.add(body);
  const torso = box(THREE, Rounded, [BODY.width * V, BODY.height * V, DEPTH], 0.14, m.torso);
  torso.position.y = BODY.height * V / 2;
  body.add(torso);
  const face = new THREE.Group();                        // eyes, cheeks and mouth move together with the gaze
  face.position.y = BODY.height * V - (EYE.top + EYE.height / 2) * V;
  body.add(face);
  const eyes = EYE.xs.map((vx, side) => eye(THREE, Rounded, m, vx + EYE.width / 2, side));
  eyes.forEach((e) => face.add(e.group));
  const cheeks = CHEEK.xs.map((vx) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(CHEEK.width * V * 1.4, 0.09), m.blush);
    c.position.set(x(vx + CHEEK.width / 2), -(CHEEK.top - EYE.top - EYE.height / 2) * V, DEPTH / 2 + 0.004);
    face.add(c);
    return c;
  });
  const mouth = box(THREE, Rounded, [0.34, 0.2, 0.06], 0.05, m.mouth, false);
  mouth.position.set(0, -0.42, DEPTH / 2 + 0.002);
  face.add(mouth);
  const curse = cursePlate(THREE, mouth.position);
  face.add(curse.mesh);
  const arms = [-1, 1].map((s) => arm(THREE, Rounded, m, s));
  body.add(...arms);
  const leaves = sprout(THREE, m);
  body.add(leaves);
  const eyeMiddle = new THREE.Vector3(0, LEG.height * V + face.position.y, DEPTH / 2);
  const lens = magnifier(THREE, Rounded, m);
  face.add(lens);
  const keyboard = createKeyboard(THREE, Rounded);
  body.add(keyboard.group);
  const parts = { spring, body, face, eyes, cheeks, mouth, curse, arms, leaves, lens, keyboard, feet, legs, m, torso,
    skin: { smile: false, mouth: true }, finish: createFinishes(THREE), gourd: null, stem: null, carve: null,
    stand: LEG.height * V, eyeMiddle };                  // stand: how high the body's underside is (a skin may shorten the legs)
  const wear = (group) => {
    group.position.y = -LEG.height * V;                  // the body's own origin is at the top of the legs
    body.add(group);
  };
  const unwear = (group) => { body.remove(group); };
  // a skin's colors (skins.js): the keys of COLOR; a key left out goes back to Cody's own color
  const recolor = (colors) => {
    for (const key of Object.keys(COLOR)) m[key].color.set(colors[key] || COLOR[key]);
    m.torso.color.copy(m.body.color);
    m.rind.color.copy(m.body.color);
    m.rind.sheenColor.copy(m.body.color).lerp(new THREE.Color(0xffffff), 0.4);
  };
  const setSkin = (skin) => {
    parts.skin = { smile: !!skin?.smile, mouth: skin?.mouth !== false };
    dress(THREE, parts, skin || {});
  };
  return { root, eyes: eyeMiddle, pose: (q) => applyPose(parts, q), wear, unwear, recolor, setSkin };
}

// takes off what the last skin put on the figure (its meshes are its own: they are thrown away)
function undress(p) {
  const drop = (group, own) => group.traverse((o) => {
    o.geometry?.dispose();
    if (own) { o.material?.map?.dispose(); o.material?.dispose(); }
  });
  if (p.gourd) { p.body.remove(p.gourd); drop(p.gourd, false); }
  if (p.stem) { p.leaves.remove(p.stem); drop(p.stem, false); }
  if (p.carve) { p.face.remove(p.carve.group); drop(p.carve.group, true); }
  p.gourd = p.stem = p.carve = null;
  unmask(p.m.torso);
  unmask(p.m.rind);
}

// a skin's own body, stem and carved mouth (skins.js checked the numbers; forms3d.js builds them)
function dress(THREE, p, skin) {
  undress(p);
  const height = BODY.height * V;
  p.stand = (skin.legs ?? LEG.height) * V;                 // what is worn hangs from the body, so it comes down too
  p.body.position.y = p.stand;
  p.eyeMiddle.y = p.stand + p.face.position.y;
  const gourd = skin.body || null;
  if (gourd) {
    p.gourd = new THREE.Mesh(gourdGeometry(THREE, [BODY.width * V, height, DEPTH], gourd), p.m.rind);
    p.gourd.position.y = height / 2;
    p.gourd.castShadow = p.gourd.receiveShadow = true;
    p.body.add(p.gourd);
  }
  p.torso.visible = !gourd;
  // a gourd is narrower near the top than the box was: the arms move in to stay on it
  p.arms.forEach((a, i) => { a.position.x = (i === 0 ? -1 : 1) * (BODY.width * V / 2 - (gourd ? gourd.inset * V : 0)); });
  if (skin.sprout) {
    p.stem = buildShapes(THREE, p.finish, skin.sprout.shapes, skin.sprout);
    p.stem.scale.setScalar(V);
    for (const piece of p.stem.children) piece.userData.rest = { x: piece.rotation.x, z: piece.rotation.z };
    p.leaves.add(p.stem);
  }
  for (const piece of p.leaves.children) piece.visible = !p.stem || piece === p.stem;
  if (skin.carve) {
    const middle = skin.carve.at[1] * V - LEG.height * V;          // the mouth's middle, from the body's underside
    const front = (y) => (DEPTH / 2) * (gourd ? gourdScale((middle + y - height / 2) / (height / 2), gourd.round) : 1);
    p.carve = carveMouth(THREE, skin.carve, front);
    p.carve.flicker = skin.carve.flicker;
    p.carve.group.position.set(skin.carve.at[0] * V, middle - p.face.position.y, 0);
    p.face.add(p.carve.group);
    p.carve.mask(gourd ? p.m.rind : p.m.torso);
  }
}

function applyPose(p, q) {
  const hop = (q.hop / PX) * BOOST.hop * V;
  p.spring.position.y = Math.max(0, hop);
  // the touch: pulls back and tips away from the touched side; listening sideways: the head tilts toward the ear
  p.spring.position.x = 0;
  const knock = Math.min(1, Math.max(0, q.knock || 0));
  p.spring.position.z = -(q.recoil || 0) * RECOIL.move + knock * KNOCK.closer;
  p.spring.rotation.x = -(q.recoil || 0) * RECOIL.tip + knock * KNOCK.lean;
  p.spring.rotation.z = -q.tilt * 2 - (q.touch || 0) * (q.recoil || 0) * RECOIL.side + (q.turn || 0) * 0.12;
  const stretch = 1 + Math.max(-0.04, Math.min(0.04, q.hop / 700));
  p.body.scale.set(2 - stretch, stretch * (1 + BREATH * q.breath), 1);
  p.body.rotation.y = q.yaw || 0;
  poseFeet(p, q);
  p.body.rotation.x = q.lookY * LOOK.turnX;
  p.face.position.x = q.lookX * LOOK.eyeX;
  // happy: the ^ of the two sticks; resting: the same, upside down and flattened (the ∪ of an eye closed in peace);
  // when sleepy, the lid weighs down to half; the blink comes down from the top
  const arc = q.mood === 'resting' ? 'asleep' : q.squint > 0.5 || p.skin.smile ? 'happy' : null;   // a skin may smile always
  const heavy = q.mood === 'sleepy' ? SLEEPY_LID : 0;
  const open = Math.max(0.1, 1 - Math.max(q.closed, heavy));
  p.eyes.forEach((e, i) => {
    e.group.position.y = -q.lookY * LOOK.eyeY + q.squint * 0.04;
    // a scene's eyes (q.eyes, eyeshapes.js) stand in for the bar and the arc while the scene shows
    const want = (q.eyes?.[i] && e.shape(q.eyes[i])) ? q.eyes[i] : null;
    if (e.shown && e.shown !== want) e.shape(e.shown).visible = false;
    if (want) e.shape(want).visible = true;
    e.shown = want;
    e.bar.visible = !arc && !want;
    e.happy.visible = !!arc && !want;
    e.happy.rotation.z = arc === 'asleep' ? Math.PI : 0;
    e.happy.scale.y = arc === 'asleep' ? 0.6 : 1;
    e.happy.position.y = arc === 'asleep' ? -0.1 : 0;
    e.bar.scale.set(1, open * (0.9 + 0.1 * q.pupil), 1);
    e.bar.position.y = -(1 - open) * EYE.height * V / 2;
  });
  p.m.blush.opacity = Math.min(1, Math.max(0, (q.blush - 0.2) * 1.4));
  p.mouth.visible = p.skin.mouth && q.talk > 0.02;    // a skin with a mouth of its own hides this one
  p.mouth.scale.set(1, 0.3 + Math.min(1, q.talk * 1.6), 1);
  if (p.carve) {
    p.carve.group.scale.y = 1 + Math.min(1, q.talk * 1.6) * CARVED.talk;
    const waver = 0.5 + 0.5 * Math.sin(q.time * CARVED.rhythm) * Math.sin(q.time * CARVED.rhythm * 0.43);
    p.carve.light(q.quiet || !p.carve.flicker ? 1 : 1 - CARVED.waver * waver);   // a candle wavers; a mouth does not
  }
  poseArms(p, q);
  poseGrab(p, q);
  p.curse.pose(q, p.mouth);
  poseMagnifier(p, q);
  p.keyboard.pose(q);
  // the sprout swings like an antenna; a skin's own stem stands still, and only its pieces that say so ("sway",
  // a tendril) take a share of the swing, each about where it starts
  const swing = { z: -q.sproutX * 0.5, x: q.sproutY * 0.3 };
  p.leaves.rotation.z = p.stem ? 0 : swing.z;
  p.leaves.rotation.x = p.stem ? 0 : swing.x;
  for (const piece of p.stem?.children ?? []) {
    if (!piece.userData.sway) continue;
    piece.rotation.z = piece.userData.rest.z + swing.z * piece.userData.sway;
    piece.rotation.x = piece.userData.rest.x + swing.x * piece.userData.sway;
  }
}

// The body pitches with the gaze (body.rotation.x: three.js applies it about the figure's x axis, after the body's
// own yaw), so its underside rises at the front when the mascot looks up and sinks there when it looks down.
// Each hip follows the underside at its own place (the leg's z in the figure, after the feet's turn), so no leg
// comes loose from the body: hipRise(leg, feetYaw, lookY) → units above the resting hip, for a leg at {x, z}
export function hipRise(leg, feetYaw, lookY) {
  const z = -leg.x * Math.sin(feetYaw) + leg.z * Math.cos(feetYaw);
  return -z * Math.tan(lookY * LOOK.turnX);
}

// the legs turn after the body (q.feet) and, while they do, step in diagonal pairs, like a little trot; each hip
// follows the body's underside and the leg stretches or shrinks so the foot stays on the floor; thinking (q.lift),
// one front leg is held up in the air
function poseFeet(p, q) {
  const yaw = q.feet || 0;
  p.feet.rotation.y = yaw;
  const stepping = q.stepping || 0;
  const lift = Math.max(0, q.lift || 0);
  const tap = q.quiet ? 0 : Math.max(0, Math.sin(q.time * LIFT.rhythm)) * LIFT.tap;
  p.legs.forEach((leg, i) => {
    const up = Math.max(0, Math.sin(q.time * STEP.rhythm + (i % 2) * Math.PI));
    const hip = p.stand + hipRise(leg.position, yaw, q.lookY || 0);
    const held = i === LIFT.leg ? lift : 0;
    leg.position.y = hip + STEP.lift * stepping * up + held * LIFT.up;
    leg.scale.y = hip / (LEG.height * V);
    leg.rotation.x = -held * (LIFT.swing + tap);
  });
}

// the magnifier rises from the hand to the front of the right eye; behind the lens, the eye grows
function poseMagnifier(p, q) {
  const hold = q.prop === 'magnifier' ? Math.max(0, q.hold || 0) : 0;
  p.lens.visible = hold > 0.02;
  p.lens.scale.setScalar(Math.max(0.001, hold));
  p.lens.position.y = (1 - Math.min(1, hold)) * -MAGNIFIER.rise;
  const rightEye = p.eyes[1].group;
  rightEye.scale.set(1 + MAGNIFIER.eye * hold, 1 + MAGNIFIER.eye * hold, 1);
}

// the two raps of a knock: two bumps (0 to 1) early in each period, then nothing until the next
export function knockTap(time) {
  const phase = (time % KNOCK.period) / KNOCK.period;
  if (phase < 0.12) return Math.sin((phase / 0.12) * Math.PI);
  if (phase >= 0.16 && phase < 0.28) return Math.sin(((phase - 0.16) / 0.12) * Math.PI);
  return 0;
}

function poseArms(p, q) {
  const typing = q.prop === 'keyboard' ? Math.min(1, Math.max(0, q.hold || 0)) : 0;
  const grab = Math.min(1, Math.max(0, q.grab || 0));
  const knock = Math.min(1, Math.max(0, q.knock || 0));
  p.arms.forEach((a, i) => {
    const s = i === 0 ? -1 : 1;
    // sideways, the ear-arm that ended up in front rises a little, like cupping a hand to the ear
    const ear = (i === 0 ? Math.max(0, q.turn || 0) : Math.max(0, -(q.turn || 0))) * 0.35;
    const onHandle = i === 1 && q.prop === 'magnifier' ? (q.hold || 0) * MAGNIFIER.arm : 0;   // the right hand holds the handle
    const raise = (i === 0 ? q.raiseL : q.raiseR) + ear + onHandle;
    const reach = i === 0 ? q.stretchL : q.stretchR;
    const loose = s * (raise * ARM_RAISE + reach * 1.4) - s * typing * TYPING.inward;
    // grabbing: the arm goes out to the side, flat, toward the edge of the screen
    a.rotation.z = loose * (1 - grab) + s * (Math.PI / 2) * 0.95 * grab;
    // typing: the arm comes down on the keys and lifts in its turn (the left hand on the even beats of the
    // keyboard's clock, the right on the odd ones, where the pressed key lights up)
    const lift = q.quiet ? 0 : Math.max(0, Math.sin(q.time * KEYBOARD.rhythm + i * Math.PI)) * TYPING.lift;
    a.rotation.x = -typing * (TYPING.forward + lift) * (1 - grab);
    a.scale.y = 1 + typing * TYPING.stretch * (1 - grab) + grab * GRAB.stretch;
    a.scale.z = 1 - typing * TYPING.thin * (1 - grab);
    a.rotation.y = 0;
    if (i === 1 && knock > 0) {                        // the right arm knocks on the screen; the rest of the pose fades under it
      const tap = q.quiet ? 0 : knockTap(q.time) * KNOCK.tap;
      a.rotation.z *= 1 - knock;
      a.rotation.x = a.rotation.x * (1 - knock) - (KNOCK.forward + tap) * knock;
      a.rotation.y = -s * KNOCK.inward * knock;
      a.scale.y = a.scale.y * (1 - knock) + (1 + KNOCK.stretch) * knock;
    }
  });
}

// the phone shaking: legs spread, eyes wide, mouth open and the body trembling (the arms are in poseArms)
function poseGrab(p, q) {
  const grab = Math.min(1.3, Math.max(0, q.grab || 0));
  p.legs.forEach((leg, i) => { leg.rotation.z = (i < 2 ? -1 : 1) * GRAB.spread * grab; });
  if (grab < 0.02) return;
  const shake = q.quiet ? 0 : Math.sin(q.time * GRAB.rhythm) * GRAB.shake * grab;
  p.spring.rotation.z += shake;
  p.spring.position.x = Math.sin(q.time * GRAB.rhythm * 0.83) * GRAB.shake * 0.8 * grab;
  for (const e of p.eyes) {
    e.bar.visible = true;
    e.happy.visible = false;
    e.bar.scale.set(1 + GRAB.eye * grab, 1 + GRAB.eye * grab, 1);
    e.bar.position.y = 0;
  }
  p.mouth.visible = p.skin.mouth;                      // a carved mouth is already open
  p.mouth.scale.set(0.8, 0.6 + 0.6 * Math.min(1, grab), 1);
}

// the open mouth full of &#$*%@!: a canvas drawn again only when a symbol appears or the jumping moves on (12 times a
// second), never per frame
function cursePlate(THREE, at) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 194;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CURSE.width, CURSE.height), material);
  mesh.position.set(at.x, at.y - 0.02, at.z + 0.04);
  mesh.visible = false;
  let drawn = '';

  function draw(shown, frame) {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = `#${COLOR.mouth.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.roundRect(6, 6, canvas.width - 12, canvas.height - 12, 70);
    g.fill();
    g.font = "bold 104px 'Varela Round', system-ui, sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (canvas.width - 90) / CURSE.text.length;
    [...CURSE.text].slice(0, shown).forEach((ch, i) => {
      const jump = ((frame + i * 3) % 4) - 1.5;
      g.save();
      g.translate(45 + step * (i + 0.5), canvas.height / 2 + jump * 7);
      g.rotate(jump * 0.07);
      g.fillStyle = CURSE.colors[i % CURSE.colors.length];
      g.fillText(ch, 0, 0);
      g.restore();
    });
    texture.needsUpdate = true;
  }

  function pose(q, mouth) {
    const t = q.curse || 0;
    mesh.visible = t > 0;
    if (!mesh.visible) return;
    mouth.visible = false;
    const shown = Math.min(CURSE.text.length, Math.ceil((t / CURSE.typed) * CURSE.text.length));
    const frame = Math.floor(t * CURSE.fps * 1.8);
    const key = `${shown}:${frame}`;
    if (key !== drawn) { draw(shown, frame); drawn = key; }
    const pop = Math.min(1, t * 8);
    mesh.scale.set(0.6 + 0.4 * pop, 0.4 + 0.6 * pop, 1);
    material.opacity = t < CURSE.fade ? 1 : 1 - (t - CURSE.fade) / (1 - CURSE.fade);
  }

  return { mesh, pose };
}
