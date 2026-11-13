// forms3d.js — turns the shapes of forms.js into meshes: the ribbed gourd body, tubes along a spine (a stem, a
// tendril, a bent hat), shapes turned on a lathe (a brim), flat plates with rounded edges (a buckle), the mouth
// carved through the front, and the finishes they are made of (leather, satin, metal, pumpkin rind), each with a
// fine grain drawn once on a small canvas. Everything is measured in voxels here, except the gourd and the carved
// mouth, which belong to the figure and come in its units.
//
//   createFinishes(THREE) → finish(name, color, glow) → a material, shared by everything that asks for the same
//   buildShapes(THREE, finish, shapes, base) → Group, in voxels (scale it by 0.1 where it goes); base: the
//                                               part's own { color, glow, finish }
//   gourdGeometry(THREE, [width, height, depth], gourd) → BufferGeometry, in units, centred
//   rindMaterial(THREE) → the gourd's material (its ribs are shaded by vertex colors)
//   carveMouth(THREE, carve, frontAt) → { group, mask(material), light(level) }: the hole and the light in it;
//                                        mask() makes a material leave the hole open (the body it is cut from),
//                                        light() dims the light inside (a candle flickers)

import { roundedRect, ribs, ribBump, gourdScale, roundCorners, radiusAt } from './forms.js';
import { seededRandom } from './seeded-random.js';

const V = 0.1;                                            // units per voxel, as in mascot3d.js
const RAD = Math.PI / 180;
const GOURD = Object.freeze({ perRib: 8, rings: 48 });
const TUBE = Object.freeze({ perPoint: 10, around: 28, perRidge: 6 });
const LATHE = Object.freeze({ perPoint: 6, around: 72 });
const HOLE = 1;                                            // the stencil value of a carved hole

// what each finish is made of; grain: [kind, repeat x, repeat y, depth of the bumps]
const FINISH = Object.freeze({
  plastic: { roughness: 0.42, clearcoat: 0.25, clearcoatRoughness: 0.45 },
  matte: { roughness: 0.78 },
  leather: { roughness: 0.56, sheen: 0.6, sheenRoughness: 0.45, sheenTint: 0.35, grain: ['leather', 5, 5, 0.45] },
  satin: { roughness: 0.36, sheen: 0.9, sheenRoughness: 0.3, sheenTint: 0.5, clearcoat: 0.1, clearcoatRoughness: 0.4 },
  metal: { roughness: 0.2, metalness: 1, envMapIntensity: 4 },
  gloss: { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.5 },   // polished: dark lenses, a visor
  glass: { roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.2, depthWrite: false },
  rind: { roughness: 0.44, clearcoat: 0.3, clearcoatRoughness: 0.4, sheen: 0.4, sheenRoughness: 0.5, sheenTint: 0.4,
    grain: ['pores', 10, 5, 0.5] },
});

// a small gray canvas of bumps: fine pores (pumpkin skin) or soft blotches with a fine grain over them (leather)
function grainTexture(THREE, kind, repeatX, repeatY) {
  if (typeof document === 'undefined') return null;        // no page (the tests): the finish goes without grain
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const random = seededRandom(kind === 'pores' ? 41 : 97);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const dots = kind === 'pores' ? 2600 : 520;
  for (let i = 0; i < dots; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = kind === 'pores' ? 0.6 + random() * 1.6 : 3 + random() * 9;
    const light = random() < (kind === 'pores' ? 0.35 : 0.5);
    g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${kind === 'pores' ? 0.2 + random() * 0.25 : 0.05 + random() * 0.08})`;
    for (const dx of [0, size, -size]) for (const dy of [0, size, -size]) {   // drawn across the edges: it tiles
      g.beginPath();
      g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (kind === 'leather') {
    for (let i = 0; i < 5200; i += 1) {
      g.fillStyle = `rgba(${random() < 0.5 ? '255,255,255' : '0,0,0'},0.13)`;
      g.fillRect(random() * size, random() * size, 1.4, 1.4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

function material(THREE, name, color, glow, grains) {
  const { grain, sheenTint, ...look } = FINISH[name] || FINISH.plastic;
  const made = new THREE.MeshPhysicalMaterial({ color, ...look });
  if (sheenTint !== undefined) made.sheenColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), sheenTint);
  if (glow) { made.emissive = new THREE.Color(glow); made.emissiveIntensity = 0.9; }
  if (grain) {
    if (!grains.has(name)) grains.set(name, grainTexture(THREE, grain[0], grain[1], grain[2]));
    made.bumpMap = grains.get(name);
    made.bumpScale = grain[3];
  }
  return made;
}

export function createFinishes(THREE) {
  const made = new Map();
  const grains = new Map();
  return (name, color, glow = null) => {
    const key = `${name}|${color}|${glow || ''}`;
    if (!made.has(key)) made.set(key, material(THREE, name, color, glow, grains));
    return made.get(key);
  };
}

export function rindMaterial(THREE) {
  const rind = material(THREE, 'rind', 0xffffff, null, new Map());
  rind.vertexColors = true;
  return rind;
}

// a grid of points (columns across, rows along) as a mesh; the last column sits on the first (the seam of the
// texture), so their normals are made one and no line shows there. loop: the last row sits on the first too (a
// ring), and gets the same care
function gridGeometry(THREE, points, colors, columns, rows, loop = false) {
  const position = new Float32Array(points.length * 3);
  const uv = new Float32Array(points.length * 2);
  points.forEach((p, i) => {
    position.set(p, i * 3);
    uv.set([(i % (columns + 1)) / columns, Math.floor(i / (columns + 1)) / rows], i * 2);
  });
  const index = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const a = r * (columns + 1) + c;
      const b = a + columns + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors.flat()), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const normal = geometry.attributes.normal;
  const one = new THREE.Vector3();
  const join = (first, last) => {
    one.set(normal.getX(first) + normal.getX(last), normal.getY(first) + normal.getY(last), normal.getZ(first) + normal.getZ(last));
    one.normalize();
    normal.setXYZ(first, one.x, one.y, one.z);
    normal.setXYZ(last, one.x, one.y, one.z);
  };
  if (loop) for (let c = 0; c <= columns; c += 1) join(c, rows * (columns + 1) + c);
  for (let r = 0; r <= rows; r += 1) join(r * (columns + 1), r * (columns + 1) + columns);
  return geometry;
}

// The gourd: the body's box with a rounded section, closed to a point above and below like a real pumpkin, its
// ribs running from one point to the other. Each rib is a little lighter or darker than its neighbours and the
// grooves are darker and redder, which is most of what makes it read as a pumpkin under a soft light.
export function gourdGeometry(THREE, [width, height, depth], gourd) {
  const half = height / 2;
  const section = roundedRect(width / 2, depth / 2, Math.min(gourd.corner * V, (depth / 2) * 0.95));
  const edges = ribs(gourd.ribs, section.length, gourd.uneven);
  const random = seededRandom(gourd.ribs * 31 + 5);
  const tint = Array.from({ length: gourd.ribs }, () => 1 - random() * 0.07);   // each rib its own shade
  const columns = gourd.ribs * GOURD.perRib;
  const back = Math.ceil(gourd.ribs / 2);                  // start at a groove at the back: the seam hides there
  const around = [];
  for (let c = 0; c <= columns; c += 1) {
    const rib = (back + Math.floor(c / GOURD.perRib)) % gourd.ribs;
    const t = (c % GOURD.perRib) / GOURD.perRib;
    const at = section.at(edges[rib] + (edges[rib + 1] - edges[rib]) * t);
    const bump = ribBump(t);
    const sink = -gourd.groove * V * (1 - bump);
    around.push({ x: at.x + at.nx * sink, z: at.z + at.nz * sink, bump, tint: tint[rib] });
  }
  const points = [];
  const colors = [];
  for (let r = 0; r <= GOURD.rings; r += 1) {
    const angle = (Math.PI * r) / GOURD.rings;
    const up = -Math.cos(angle);
    const yn = Math.sign(up) * Math.abs(up) ** (2 / gourd.round);
    const k = r === 0 || r === GOURD.rings ? 0 : gourdScale(yn, gourd.round);
    const top = yn > 0 ? (1 - k) : 0;                      // toward the crown: the ribs meet under the stem
    for (const a of around) {
      points.push([
        a.x * k + gourd.crown[0] * V * top * top,
        yn * half - gourd.dip * V * top ** 3,
        a.z * k + gourd.crown[1] * V * top * top,
      ]);
      const dark = gourd.shade * (1 - a.bump) ** 1.3 + 0.1 * (0.5 - yn / 2);   // the grooves, and a little the underside
      const light = a.tint * (1 - dark);
      colors.push([a.tint * (1 - dark * 0.45), light, light * (1 - dark * 0.3)]);
    }
  }
  const geometry = gridGeometry(THREE, points, colors, columns, GOURD.rings);
  const normal = geometry.attributes.normal;               // the two points where the ribs meet look straight down and up
  for (let c = 0; c <= columns; c += 1) {
    normal.setXYZ(c, 0, -1, 0);
    normal.setXYZ(GOURD.rings * (columns + 1) + c, 0, 1, 0);
  }
  return geometry;
}

// the rings of a tube from t = from to t = to: the spine through the path's points, the radius read along it,
// lengthwise ridges if asked, each ring turned as little as possible from the one before (no twisting)
function tubeRings(THREE, shape, from, to, lift) {
  const loop = shape.closed && !lift && from === 0 && to === 1;      // a ring: no ends, the last ring is the first
  const spine = new THREE.CatmullRomCurve3(shape.path.map((p) => new THREE.Vector3(p[0], p[1], p[2])), shape.closed, 'centripetal');
  const rows = Math.max(2, Math.round(shape.path.length * TUBE.perPoint * (to - from)));
  const columns = shape.ridges ? shape.ridges * TUBE.perRidge : TUBE.around;
  const points = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const across = new THREE.Vector3();
  const at = new THREE.Vector3();
  spine.getTangent(from, tangent);
  side.set(1, 0, 0);
  if (Math.abs(tangent.x) > 0.9) side.set(0, 0, 1);
  const ring = (t, radius) => {
    spine.getPoint(t, at);
    spine.getTangent(t, tangent);
    side.addScaledVector(tangent, -side.dot(tangent)).normalize();
    across.crossVectors(tangent, side);
    for (let c = 0; c <= columns; c += 1) {
      const turn = (c % columns) / columns;
      const groove = shape.ridges ? 1 - shape.ridge * (1 - ribBump((turn * shape.ridges) % 1)) : 1;
      const r = radius * groove;
      const angle = turn * Math.PI * 2;
      points.push([
        at.x + (side.x * Math.cos(angle) + across.x * Math.sin(angle)) * r,
        at.y + (side.y * Math.cos(angle) + across.y * Math.sin(angle)) * r,
        at.z + (side.z * Math.cos(angle) + across.z * Math.sin(angle)) * r,
      ]);
    }
  };
  let count = 0;
  const add = (t, radius) => { ring(t, radius); count += 1; };
  // an end is a flat cap with a sharp rim (the ring is there twice: once for the cap, once for the side); a
  // band's edge comes down to the surface it goes around instead
  const end = (t) => {
    const radius = radiusAt(shape.radius, t);
    if (lift) add(t, radius);
    else if (t === from) { add(t, 0); add(t, radius); } else { add(t, radius); add(t, 0); }
  };
  if (!loop) end(from);
  for (let i = 0; i <= rows; i += 1) {
    const t = from + ((to - from) * i) / rows;
    if (loop && i === rows) {                              // the very points it started with: it closes exactly
      points.push(...points.slice(0, columns + 1).map((p) => [...p]));
      count += 1;
    } else add(t, radiusAt(shape.radius, t) + lift);
  }
  if (!loop) end(to);
  return gridGeometry(THREE, points, null, columns, count - 1, loop);
}

export const tubeGeometry = (THREE, shape) => tubeRings(THREE, shape, 0, 1, 0);
export const bandGeometry = (THREE, shape, band) => tubeRings(THREE, shape, band.span[0], band.span[1], band.lift);

// the profile, smoothed through its points, turned around the vertical axis; the wave lifts and lowers the rim
// (more the farther out), so a brim is not a flat disc
export function latheGeometry(THREE, shape) {
  const smooth = new THREE.SplineCurve(shape.profile.map((p) => new THREE.Vector2(p[0], p[1])))
    .getPoints(shape.profile.length * LATHE.perPoint);
  // the outside must be on the left of the way the profile goes (up the outside): a profile given the other way
  // around is turned, so its faces look out either way
  const closedArea = [...smooth, { x: 0, y: smooth[smooth.length - 1].y }, { x: 0, y: smooth[0].y }]
    .reduce((sum, p, i, all) => sum + p.x * all[(i + 1) % all.length].y - all[(i + 1) % all.length].x * p.y, 0);
  if (closedArea < 0) smooth.reverse();
  const reach = Math.max(...smooth.map((p) => p.x), 0.001);
  const [waveHeight, waveCount, wavePhase] = shape.wave;
  const points = [];
  for (const p of smooth) {
    const radius = Math.max(0, p.x);
    for (let c = 0; c <= LATHE.around; c += 1) {
      const angle = ((c % LATHE.around) / LATHE.around) * Math.PI * 2;
      const lift = waveHeight * (radius / reach) ** 2 * Math.sin(waveCount * angle + wavePhase * RAD);
      points.push([Math.sin(angle) * radius, p.y + lift, Math.cos(angle) * radius]);
    }
  }
  return gridGeometry(THREE, points, null, LATHE.around, smooth.length - 1);
}

const flatShape = (THREE, outline, round) => new THREE.Shape(roundCorners(outline, round).map((p) => new THREE.Vector2(p[0], p[1])));

// a flat outline given a thickness, centred on its own plane; the bevel rounds the edges without growing it
export function plateGeometry(THREE, shape) {
  const flat = flatShape(THREE, shape.outline, shape.round);
  if (shape.hole) flat.holes.push(flatShape(THREE, shape.hole, shape.round * 0.6));
  const bevel = Math.min(shape.bevel, shape.depth / 2);
  const geometry = new THREE.ExtrudeGeometry(flat, {
    depth: shape.depth - bevel * 2, curveSegments: 6,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5,
  });
  geometry.translate(0, 0, -(shape.depth - bevel * 2) / 2);
  return geometry;
}

const GEOMETRY = { tube: tubeGeometry, lathe: latheGeometry, plate: plateGeometry };

export function buildShapes(THREE, finish, shapes, base = {}) {
  const group = new THREE.Group();
  const meshOf = (geometry, look) => {
    const made = finish(look.finish || base.finish || 'plastic', look.color || base.color || '#ffffff', look.glow || base.glow || null);
    const mesh = new THREE.Mesh(geometry, made);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  for (const shape of shapes) {
    const pieces = [meshOf(GEOMETRY[shape.kind](THREE, shape), shape)];
    for (const band of shape.bands || []) pieces.push(meshOf(bandGeometry(THREE, shape, band), band));
    // side -1: the same pieces again on the other side of the pivot, as in a mirror
    for (const side of shape.mirror ? [1, -1] : [1]) {
      const holder = new THREE.Group();
      holder.position.set(shape.at[0] * side, shape.at[1], shape.at[2]);
      holder.rotation.set(shape.turn[0] * RAD, shape.turn[1] * RAD * side, shape.turn[2] * RAD * side);
      holder.scale.x = side;
      holder.userData.sway = shape.sway;                   // for whoever swings it (a skin's sprout: mascot3d.js)
      holder.add(...(side === 1 ? pieces : pieces.map((mesh) => mesh.clone())));
      group.add(holder);
    }
  }
  return group;
}

// the light inside the carved mouth: bright in the middle, warmer toward the edges
function glowTexture(THREE, [middle, edge]) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = edge;
  g.fillRect(0, 0, 256, 128);
  g.save();
  g.scale(2, 1);                                           // the mouth is wide: the round glow becomes an oval
  const glow = g.createRadialGradient(64, 70, 4, 64, 64, 66);
  glow.addColorStop(0, middle);
  glow.addColorStop(0.4, middle);
  glow.addColorStop(1, edge);
  g.fillStyle = glow;
  g.fillRect(0, 0, 128, 128);
  g.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The carved mouth is a real hole, without cutting the body's mesh: its outline is drawn first into the stencil
// only (nothing on screen), the body's material then skips those pixels (mask), and what shows there is the
// little room behind: the cut's walls, going from the skin's color to the light, and the lit back. Seen from the
// side the walls shift against the back, as a hole does. frontAt(y) → the body's front (z) at a height, so the
// outline lies on a body that is not flat. Units: the figure's, around the mouth's own middle.
export function carveMouth(THREE, carve, frontAt = () => 0) {
  const outline = roundCorners(carve.outline, carve.round).map((p) => [p[0] * V, p[1] * V]);
  const depth = carve.depth * V;
  const group = new THREE.Group();
  const stencil = { stencilWrite: true, stencilRef: HOLE };
  const inside = { ...stencil, stencilFunc: THREE.EqualStencilFunc, toneMapped: false };

  const hole = new THREE.ShapeGeometry(new THREE.Shape(outline.map((p) => new THREE.Vector2(p[0], p[1]))));
  const flat = hole.attributes.position;
  for (let i = 0; i < flat.count; i += 1) flat.setZ(i, frontAt(flat.getY(i)));
  const portal = new THREE.Mesh(hole, new THREE.MeshBasicMaterial({
    ...stencil, colorWrite: false, depthWrite: false, depthTest: false,
    stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  }));
  portal.renderOrder = -2;                                 // before everything: the hole is known when the body draws

  // the walls: one strip around the outline, from the surface back to the light
  const skin = new THREE.Color(carve.wall);
  const lit = new THREE.Color(carve.glow[1]);
  const position = [];
  const color = [];
  const index = [];
  outline.forEach((p, i) => {
    position.push(p[0], p[1], frontAt(p[1]) + 0.004, p[0], p[1], frontAt(p[1]) - depth);
    color.push(skin.r, skin.g, skin.b, lit.r, lit.g, lit.b);
    const a = i * 2;
    const b = ((i + 1) % outline.length) * 2;
    index.push(a, b, a + 1, b, b + 1, a + 1);
  });
  const strip = new THREE.BufferGeometry();
  strip.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  strip.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  strip.setIndex(index);
  const walls = new THREE.Mesh(strip, new THREE.MeshBasicMaterial({ ...inside, vertexColors: true, side: THREE.DoubleSide }));

  const xs = outline.map((p) => p[0]);
  const ys = outline.map((p) => p[1]);
  const box = { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
  const margin = depth * 2 + 0.05;                         // the back is wider than the hole: no edge shows from the side
  const texture = glowTexture(THREE, carve.glow);
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(box.right - box.left + margin * 2, box.top - box.bottom + margin * 2),
    new THREE.MeshBasicMaterial({ ...inside, ...(texture ? { map: texture } : { color: carve.glow[0] }) }),
  );
  back.position.set((box.left + box.right) / 2, (box.bottom + box.top) / 2, Math.min(...ys.map(frontAt)) - depth);
  walls.renderOrder = back.renderOrder = -1;               // after the hole, before the body

  group.add(portal, back, walls);
  const light = (level) => { back.material.color.setScalar(level); };   // the candle inside: 1 is full
  const mask = (made) => {
    made.stencilWrite = true;
    made.stencilRef = HOLE;
    made.stencilFunc = THREE.NotEqualStencilFunc;
    made.needsUpdate = true;
  };
  return { group, mask, light };
}

// a material goes back to being drawn everywhere (the skin with the hole came off)
export function unmask(made) {
  made.stencilWrite = false;
  made.needsUpdate = true;
}
