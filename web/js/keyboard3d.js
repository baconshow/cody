// keyboard3d.js — the 3D mascot's keyboard: when Claude writes code, a little dark plastic keyboard rises in front of
// it, lying flat and turned toward the viewer, and it types with both hands (the arms stretch to the keys, in
// mascot3d.js). The keys it presses sink and light up orange. Same style as the magnifier: varnished plastic,
// rounded corners.
//
//   createKeyboard(THREE, RoundedBoxGeometry) → { group, pose(q) }   the group goes on the figure's body
//     pose(q)   q.prop === 'keyboard' and q.hold (0 to 1) bring in the keyboard; q.time picks the current key

export const KEYBOARD = Object.freeze({
  width: 2.85, depth: 0.8, base: 0.07, y: 0.52, z: 1.12, tilt: 0.35, rise: 0.7,
  rows: 3, columns: 14, key: 0.15, gap: 0.045, rhythm: 13,
});
const COLOR = Object.freeze({ base: 0x1c1b21, key: 0xdedad2, pressed: 0xff8a3d });

export function createKeyboard(THREE, Rounded) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new Rounded(KEYBOARD.width, KEYBOARD.base, KEYBOARD.depth, 3, 0.03),
    new THREE.MeshPhysicalMaterial({ color: COLOR.base, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.2 }));
  base.position.z = -0.04;                                     // the base covers the rows and the space bar
  base.castShadow = true;
  group.add(base);
  const pitch = KEYBOARD.key + KEYBOARD.gap;
  const total = KEYBOARD.rows * KEYBOARD.columns + 1;          // plus the space bar
  const keys = new THREE.InstancedMesh(new Rounded(KEYBOARD.key, 0.05, KEYBOARD.key, 2, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), total);
  const slots = [];
  for (let r = 0; r < KEYBOARD.rows; r++) {
    for (let c = 0; c < KEYBOARD.columns; c++) {
      // facing the typist: the top row far from it (near the viewer), the bottom one near its body
      slots.push({ x: (c - (KEYBOARD.columns - 1) / 2) * pitch + (r % 2) * pitch * 0.3, z: (1.25 - r) * pitch, width: 1 });
    }
  }
  slots.push({ x: 0, z: -1.55 * pitch, width: 6 });           // the space bar, near its body
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const place = (i, sink) => {
    const s = slots[i];
    matrix.makeScale(s.width, 1, 1).setPosition(s.x, KEYBOARD.base / 2 + 0.02 - sink, s.z);
    keys.setMatrixAt(i, matrix);
  };
  slots.forEach((_, i) => { place(i, 0); keys.setColorAt(i, color.set(COLOR.key)); });
  keys.castShadow = true;
  group.add(keys);
  group.position.set(0, KEYBOARD.y, KEYBOARD.z);
  group.rotation.x = KEYBOARD.tilt;
  group.visible = false;
  const st = { pressed: -1 };

  // the current key: one per beat, picked from the clock (the same instant always gives the same key)
  function press(time) {
    const beat = Math.floor(time * KEYBOARD.rhythm);
    const i = Math.abs((beat * 2654435761) % (slots.length - 1));
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
