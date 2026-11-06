// decorations3d.js — what comes out of the 3D mascot's head: block Z letters rising while it sleeps (resting) and
// the thought bubbles, smallest to largest, while it thinks. The group goes on the mascot's body (mascot.wear), so
// it turns and hops with the head; the bubbles float in front of the face, like the keyboard and the coffee.
//
//   createDecorations(THREE, RoundedBoxGeometry, top) → { group, update(q) }   top: y of the top of the head
//     update(q)   q.mood and q.time from the animator; with q.quiet, the letters stop halfway up

const ZZZ = Object.freeze({ letters: 3, rise: 0.75, period: 3.6, size: 0.2, stroke: 0.05, depth: 0.03,
  color: 0xf4f1ff });
// [offset, radius × 0.1]: the first one starts at the head's corner; the last and largest floats above the others
const BUBBLES = Object.freeze([[0.12, 0.08], [0.32, 0.3], [0.58, 0.58], [0.95, 0.95]]);
const BUBBLE_Z = 0.95;                                   // in front of the face (its front is at 0.8)

// the Z in one piece: its outline (top bar, diagonal, bottom bar) extruded with rounded edges, one geometry shared
// by all the letters
function letterZ(THREE) {
  const h = ZZZ.size / 2;
  const t = ZZZ.stroke;
  const d = t * 1.45;                                  // how wide the diagonal is where it meets a bar
  const outline = [[-h, h], [h, h], [h, h - t], [-h + d, -h + t], [h, -h + t], [h, -h], [-h, -h], [-h, -h + t],
    [h - d, h - t], [-h, h - t]];
  const shape = new THREE.Shape(outline.map(([px, py]) => new THREE.Vector2(px, py)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: ZZZ.depth, bevelEnabled: true, bevelThickness: 0.012,
    bevelSize: 0.01, bevelSegments: 3, curveSegments: 4 });
  geometry.translate(0, 0, -ZZZ.depth / 2);
  return geometry;
}

export function createDecorations(THREE, Rounded, top) {
  const group = new THREE.Group();
  const matZ = new THREE.MeshBasicMaterial({ color: ZZZ.color, transparent: true });
  const shapeZ = letterZ(THREE);
  const letters = Array.from({ length: ZZZ.letters }, () => {
    const material = matZ.clone();
    const z = new THREE.Mesh(shapeZ, material);
    group.add(z);
    return { z, material };
  });
  const matBubble = new THREE.MeshPhysicalMaterial({ color: 0xf2ece2, roughness: 0.35, clearcoat: 0.6 });
  const bubbles = BUBBLES.map(([d, r]) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1 + 0.03, 20, 14), matBubble);
    b.position.set(0.7 + d * 0.6, top - 0.15 + d * 0.5, BUBBLE_Z);
    group.add(b);
    return b;
  });

  function update(q) {
    const asleep = q.mood === 'resting';
    letters.forEach(({ z, material }, i) => {
      z.visible = asleep;
      if (!asleep) return;
      const phase = q.quiet ? 0.45 + i * 0.18 : ((q.time / ZZZ.period) + i / ZZZ.letters) % 1;
      z.position.set(-(0.75 + phase * 0.45 + Math.sin(phase * 6) * 0.06), top + phase * ZZZ.rise, 0.3);   // on the left: the nightcap is on the right
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
