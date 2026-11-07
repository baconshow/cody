// keyboard3d.js — the 3D mascot's keyboard: when Claude writes code, a little dark plastic keyboard rises in front of
// it, lying flat against its belly, and it types with both hands (the arms come down on the keys, in mascot3d.js:
// one hand rests on the keys while the other one lifts, to KEYBOARD.rhythm). The key under the hand that is down
// sinks and lights up orange. Same style as the magnifier: varnished plastic, rounded corners.
//
// It is laid out like a real keyboard from the mascot's seat, so the viewer sees it the wrong way round: the
// space bar nearest the mascot, then the three letter rows (the two Shifts, Caps and Enter, Tab, each its real
// width), the number row nearest the viewer, and the numeric keypad on the mascot's right, which is the viewer's
// left (with + and Enter two rows tall, 0 two keys wide).
//
//   createKeyboard(THREE, RoundedBoxGeometry) → { group, pose(q) }   the group goes on the figure's body
//     pose(q)   q.prop === 'keyboard' and q.hold (0 to 1) bring in the keyboard; q.time picks the current key
//   KEY_SLOTS: the keys, [x, z, width, depth] in units; pickKey(time): the key under the hand that is down (pure)

export const KEYBOARD = Object.freeze({
  key: 0.105, gap: 0.03, padGap: 0.075, margin: 0.05,  // a key, the space between keys, the gap before the keypad
  base: 0.07, y: 0.52, z: 1.2, tilt: 0.25, rise: 0.7,   // tilt: the near edge lower, so the viewer sees the keys
  rhythm: 13,                                          // radians per second of the hands: a beat is half a turn
});
const PITCH = KEYBOARD.key + KEYBOARD.gap;
// the main block, row by row from the viewer to the mascot (the number row first), as widths in keys: 15 keys wide
const ROWS = Object.freeze([
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],                  // numbers and Backspace
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],              // Tab, the top letters, the backslash
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],               // Caps Lock, the home row, Enter
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],                  // the two Shifts
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],            // Ctrl, Win, Alt, the space bar, Alt, Fn, Menu, Ctrl
]);
const MAIN_WIDTH = 15;
// the numeric keypad: [column, row, width, depth] in keys; + and Enter are two rows tall, 0 is two keys wide
const NUMPAD = Object.freeze([
  [0, 0], [1, 0], [2, 0], [3, 0],
  [0, 1], [1, 1], [2, 1], [3, 1, 1, 2],
  [0, 2], [1, 2], [2, 2],
  [0, 3], [1, 3], [2, 3], [3, 3, 1, 2],
  [0, 4, 2, 1], [2, 4],
]);
const PAD_WIDTH = 4;
const COLOR = Object.freeze({ base: 0x1c1b21, key: 0xdedad2, pressed: 0xff8a3d });

// every key as [x, z, width, depth] in units, x and z at its middle; the keyboard's middle is 0, 0, +z is toward
// the viewer and +x the mascot's left: the main block runs from there toward the mascot's right, the keypad after it
function slots() {
  const whole = (MAIN_WIDTH + PAD_WIDTH) * PITCH + KEYBOARD.padGap;
  const x0 = whole / 2;
  const z = (row, depth = 1) => -(row - (ROWS.length - 1) / 2 + (depth - 1) / 2) * PITCH;   // row 0 nearest the viewer
  const size = (keys) => keys * PITCH - KEYBOARD.gap;
  const out = [];
  ROWS.forEach((widths, row) => {
    let at = 0;
    for (const w of widths) {
      out.push([x0 - (at + w / 2) * PITCH, z(row), size(w), size(1)]);
      at += w;
    }
  });
  const pad0 = x0 - MAIN_WIDTH * PITCH - KEYBOARD.padGap;
  for (const [column, row, w = 1, d = 1] of NUMPAD) out.push([pad0 - (column + w / 2) * PITCH, z(row, d), size(w), size(d)]);
  return { keys: out, width: whole + 2 * KEYBOARD.margin, depth: ROWS.length * PITCH + 2 * KEYBOARD.margin };
}

export const KEY_SLOTS = Object.freeze(slots());

// the keys under each hand: the hands come down on the outer thirds of the keyboard (the mascot's left hand on
// +x, its right hand on the keypad side)
const HAND_X = KEY_SLOTS.width / 3;
const UNDER = Object.freeze([-1, 1].map((side) => KEY_SLOTS.keys.map((k, i) => (k[0] * side > HAND_X ? i : -1)).filter((i) => i >= 0)));

// the key being pressed at this instant: one per beat, under the hand that is down (the mascot's left hand on
// even beats, its right on odd ones: mascot3d.js lifts the other one); the same instant always gives the same key
export function pickKey(time) {
  const beat = Math.floor((time * KEYBOARD.rhythm) / Math.PI);
  const under = UNDER[beat % 2 === 0 ? 1 : 0];
  return under[Math.abs((beat * 2654435761) % under.length)];
}

export function createKeyboard(THREE, Rounded) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new Rounded(KEY_SLOTS.width, KEYBOARD.base, KEY_SLOTS.depth, 3, 0.03),
    new THREE.MeshPhysicalMaterial({ color: COLOR.base, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  base.castShadow = true;
  group.add(base);
  const total = KEY_SLOTS.keys.length;
  const keys = new THREE.InstancedMesh(new Rounded(KEYBOARD.key, 0.05, KEYBOARD.key, 2, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), total);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const place = (i, sink) => {
    const [x, z, width, depth] = KEY_SLOTS.keys[i];
    matrix.makeScale(width / KEYBOARD.key, 1, depth / KEYBOARD.key).setPosition(x, KEYBOARD.base / 2 + 0.02 - sink, z);
    keys.setMatrixAt(i, matrix);
  };
  KEY_SLOTS.keys.forEach((_, i) => { place(i, 0); keys.setColorAt(i, color.set(COLOR.key)); });
  keys.castShadow = true;
  group.add(keys);
  group.position.set(0, KEYBOARD.y, KEYBOARD.z);
  group.rotation.x = KEYBOARD.tilt;
  group.visible = false;
  const st = { pressed: -1 };

  function press(time) {
    const i = pickKey(time);
    if (i === st.pressed) return;
    if (st.pressed >= 0) { place(st.pressed, 0); keys.setColorAt(st.pressed, color.set(COLOR.key)); }
    place(i, 0.025);
    keys.setColorAt(i, color.set(COLOR.pressed));
    st.pressed = i;
    keys.instanceMatrix.needsUpdate = true;
    keys.instanceColor.needsUpdate = true;
  }

  return {
    group,
    pose(q) {
      const hold = q.prop === 'keyboard' ? Math.max(0, q.hold || 0) : 0;
      group.visible = hold > 0.02;
      if (!group.visible) return;
      group.scale.setScalar(Math.max(0.001, Math.min(1, hold)));
      group.position.y = KEYBOARD.y - (1 - Math.min(1, hold)) * KEYBOARD.rise;
      if (hold > 0.8 && !q.quiet) press(q.time);
    },
  };
}
