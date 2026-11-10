// scene3d.js — the mascot in 3D (instead of the flat drawing in face2d.js): the mascot figure on a dark table over
// pure black, warm light from one side, a cool rim light from the other so it stands out from the background, a soft
// shadow underneath and a room reflection (RoomEnvironment) on the plastic. The animator (animator.js) is the same:
// only what draws it changes. When a scene puts something beside the mascot that would not fit (the monitor), the
// camera slides sideways to keep both in the picture, and pulls back only if it must (scenes.js frameFor).
//
//   createScene3d(canvas) → { measure(width, height, dpr), draw(q), eyeCenter() → { x, y } in CSS px }
//     measure  width and height in CSS px; returns the framing mode. Wide screen (phone in landscape): the face
//              big, peeking up from the bottom edge, like Bluey ('peek'); otherwise the whole figure, with room
//              above for the letters and the thought bubble ('full')

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createMascot } from './mascot3d.js';
import { createDecorations } from './decorations3d.js';
import { createScenes3d } from './scenes3d.js';
import { createFinishes } from './forms3d.js';
import { frameFor } from './scenes.js';

const PEEK_FROM_ASPECT = 1.8;                            // width / height
const FRAME = Object.freeze({
  peek: Object.freeze({ halfWidth: 2.55, targetY: 1.42, cameraHeight: 1.8 }),
  full: Object.freeze({ halfWidth: 2.3, halfHeight: 1.65, targetY: 1.15, cameraHeight: 2.1 }),
});
const FOV = 28;
const MAX_DPR = 2;
const HEAD_TOP = 1.9;
const SLIDE = 4;                                         // how fast the camera follows a scene (per second)
const NO_SPAN = Object.freeze([0, 0]);

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x140c08, 0.35));
  const key = new THREE.DirectionalLight(0xffe0bf, 1.9);
  key.position.set(-3.2, 5, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.radius = 6;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;                            // curved skins (a gourd, a hat) shadow themselves cleanly
  const rim = new THREE.DirectionalLight(0x9cc0ff, 1.6);
  rim.position.set(3.5, 3, -4);
  const fill = new THREE.PointLight(0xff8a3d, 4, 8, 2);
  fill.position.set(2.4, 1.2, 2.6);
  scene.add(key, rim, fill);
}

// the table: a dark disc that fades into black at the edges, with the figure's shadow on top
function table(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(70, 44, 28, 1)');
  grad.addColorStop(0.55, 'rgba(28, 18, 12, 0.85)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.75 }));
  disc.rotation.x = -Math.PI / 2;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: 0.55 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  shadow.receiveShadow = true;
  scene.add(disc, shadow);
}

function createRenderer(canvas) {
  // stencil: a skin's carved mouth is a hole marked there (forms3d.js carveMouth)
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
  r.setClearColor(0x000000, 1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;                // ACES pulls the orange toward peach
  r.toneMappingExposure = 0.95;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

// the camera pulls back until the requested half width fits (and, in full mode, the half height too). Returns the
// framing: its mode, the distance and how many units the screen shows to each side of the middle
function frameCamera(camera, width, height) {
  const aspect = width / Math.max(1, height);
  const mode = aspect >= PEEK_FROM_ASPECT ? 'peek' : 'full';
  const f = FRAME[mode];
  const half = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  let dist = f.halfWidth / (half * aspect);
  if (f.halfHeight) dist = Math.max(dist, f.halfHeight / half);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  return { mode, dist, halfWidth: dist * half * aspect, f };
}

// look: { x, zoom }, how far the camera slid sideways and pulled back for the scene
function placeCamera(camera, view, look) {
  camera.position.set(look.x, view.f.cameraHeight, view.dist * look.zoom);
  camera.lookAt(look.x, view.f.targetY, 0);
}

export function createScene3d(canvas) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  lights(scene);
  table(scene);
  const mascot = createMascot(THREE, RoundedBoxGeometry);
  const decorations = createDecorations(THREE, RoundedBoxGeometry, HEAD_TOP);
  scene.add(mascot.root);
  mascot.wear(decorations.group);                        // the Z letters move with the head
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const size = { width: 1, height: 1 };
  const point = new THREE.Vector3();
  const look = { x: 0, zoom: 1 };
  let view = null;
  let scenes = null;
  let lastTime = null;
  const finish = createFinishes(THREE);                    // the shapes' materials outlive a rebuild of the scenes

  // the camera goes where the current scene fits; true while it is still on its way
  function follow(sceneId, dt, quiet) {
    if (!view) return false;
    const want = frameFor(view.halfWidth, scenes ? scenes.span(sceneId) : NO_SPAN);
    const zoom = want.halfWidth / view.halfWidth;
    if (!Number.isFinite(want.x) || !Number.isFinite(zoom)) return false;   // never let a bad number into the camera
    const k = quiet ? 1 : Math.min(1, dt * SLIDE);
    const near = (a, b) => Math.abs(a - b) < 0.002;
    if (near(look.x, want.x) && near(look.zoom, zoom)) return false;
    look.x = k === 1 || near(look.x, want.x) ? want.x : look.x + (want.x - look.x) * k;
    look.zoom = k === 1 || near(look.zoom, zoom) ? zoom : look.zoom + (zoom - look.zoom) * k;
    placeCamera(camera, view, look);
    return true;
  }

  return {
    measure(width, height, dpr) {
      size.width = width;
      size.height = height;
      renderer.setPixelRatio(Math.min(dpr, MAX_DPR));
      renderer.setSize(width, height, false);
      view = frameCamera(camera, width, height);
      placeCamera(camera, view, look);
      return view.mode;
    },
    draw(q) {
      mascot.pose(q);
      decorations.update(q);
      const dt = lastTime === null ? 0 : Math.min(0.1, Math.max(0, q.time - lastTime));
      lastTime = q.time;
      const changed = scenes ? scenes.update(q, q.scene, dt, q.over, q.skin) : false;
      follow(q.scene, dt, q.quiet);
      renderer.render(scene, camera);
      return changed;
    },
    // the scenes of web/scenes/scenes.json (only the main face has them, not the gallery)
    setScenes(list, extra = []) {                        // extra: the skins' pieces (skins.js skinScene); again: rebuilt
      if (scenes) { scene.remove(scenes.group); mascot.unwear(scenes.worn); }
      scenes = createScenes3d(THREE, [...list, ...extra], finish);
      scene.add(scenes.group);
      mascot.wear(scenes.worn);
    },
    // a skin (skins.js): the figure's new colors and looks; null or the classic one puts everything back
    setSkin(skin) {
      mascot.recolor(skin?.colors || {});
      mascot.setSkin(skin);
    },
    eyeCenter() {
      point.copy(mascot.eyes).project(camera);
      return { x: (point.x + 1) / 2 * size.width, y: (1 - point.y) / 2 * size.height };
    },
  };
}
