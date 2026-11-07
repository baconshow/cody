// decorations3d.js — what comes out of the 3D mascot's head: block Z letters rising while it sleeps (resting). The
// group goes on the mascot's body (mascot.wear), so it turns and hops with the head. The thought bubble while it
// thinks is a scene (scenes.json, "thinking"): the block with the three dots, worn in front of the face.
//
//   createDecorations(THREE, RoundedBoxGeometry, top) → { group, update(q) }   top: y of the top of the head
//     update(q)   q.mood and q.time from the animator; with q.quiet, the letters stop halfway up

const ZZZ = Object.freeze({ letters: 3, rise: 0.75, period: 3.6, size: 0.2, stroke: 0.05, depth: 0.03,
  color: 0xf4f1ff });

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
  }

  return { group, update };
}
