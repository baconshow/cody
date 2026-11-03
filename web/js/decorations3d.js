// decorations3d.js — what comes out of the 3D mascot's head: block Z letters rising while it sleeps (resting) and
// the three thought bubbles, smallest to largest, while it thinks.
//
//   createDecorations(THREE, RoundedBoxGeometry, top) → { group, update(q) }   top: y of the top of the head
//     update(q)   q.mood and q.time from the animator; with q.quiet, the letters stop halfway up

const ZZZ = Object.freeze({ letters: 3, rise: 0.75, period: 3.6, size: 0.2, color: 0xf4f1ff });
const BUBBLES = Object.freeze([[0.12, 0.08], [0.32, 0.3], [0.58, 0.58]]);   // [offset, radius × 0.1]

// the block Z: the top bar, the diagonal and the bottom bar
function letterZ(THREE, Rounded, mat) {
  const z = new THREE.Group();
  const bar = (width, height, xx, yy, turn = 0) => {
    const b = new THREE.Mesh(new Rounded(width, height, 0.05, 2, 0.015), mat);
    b.position.set(xx, yy, 0);
    b.rotation.z = turn;
    z.add(b);
  };
  const l = ZZZ.size;
  bar(l, 0.045, 0, l / 2);
  bar(l, 0.045, 0, -l / 2);
  bar(l * 1.25, 0.045, 0, 0, Math.atan2(l, l));
  return z;
}

export function createDecorations(THREE, Rounded, top) {
  const group = new THREE.Group();
  const matZ = new THREE.MeshBasicMaterial({ color: ZZZ.color, transparent: true });
  const letters = Array.from({ length: ZZZ.letters }, () => {
    const material = matZ.clone();
    const z = letterZ(THREE, Rounded, material);
    group.add(z);
    return { z, material };
  });
  const matBubble = new THREE.MeshPhysicalMaterial({ color: 0xf2ece2, roughness: 0.35, clearcoat: 0.6 });
  const bubbles = BUBBLES.map(([d, r]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1 + 0.03, 20, 14), matBubble);
    b.position.set(0.8 + d * 0.7, top - 0.05 + d * 0.55, 0.2);
    group.add(b);
    return b;
  });

  function update(q) {
    const asleep = q.mood === 'resting';
    letters.forEach(({ z, material }, i) => {
      z.visible = asleep;
      if (!asleep) return;
      const phase = q.quiet ? 0.45 + i * 0.18 : ((q.time / ZZZ.period) + i / ZZZ.letters) % 1;
      z.position.set(0.55 + phase * 0.45 + Math.sin(phase * 6) * 0.06, top + phase * ZZZ.rise, 0.3);
      z.scale.setScalar(0.7 + phase * 0.8);
      material.opacity = Math.min(1, phase * 4) * (1 - phase);
    });
    const thinking = q.mood === 'thinking';
    bubbles.forEach((b, i) => {
      b.visible = thinking;
      if (thinking && !q.quiet) b.position.y = top - 0.05 + BUBBLES[i][0] * 0.55 + Math.sin(q.time * 2 + i) * 0.03;
    });
  }

  return { group, update };
}
