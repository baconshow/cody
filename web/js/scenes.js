// scenes.js — which scene the mascot is in. A scene is data (web/scenes/scenes.json: voxel pieces, trigger, clips,
// sound, priority), so a skin or a community scene is just another entry. This file only decides: of the scenes
// whose trigger is on, the one with the highest priority. Pure logic, run in Node by the tests.
//
//   pickScene(scenes, situation) → scene | null
//   situation: { mood, reading, idleSeconds, happy } (cycle.js situation())
//   anchorOf(part) → 'body' (worn: it moves with the mascot) | 'world' (it stands around it)
//   pivotOf(part) → [x, y, z] in voxels: where a part grows from and sways around
//   sceneSpan(scene) → [left, right] in units: how far its standing pieces reach to each side of the mascot's middle
//   frameFor(halfWidth, span) → { x, halfWidth }: where the camera looks so the mascot and the scene both fit

export const IDLE_COFFEE_S = 45;          // this long with nothing going on, and the coffee comes out

export const TRIGGERS = Object.freeze({
  failed: (s) => !!s.reading?.failed,                       // a command or a test failed a moment ago
  done: (s) => !!s.happy,                                   // a long task finished, an agent came back, a pat
  sleeping: (s) => s.mood === 'resting',
  coding: (s) => !!s.reading?.code,
  thinking: (s) => s.mood === 'thinking',
  music: (s) => !!s.reading?.music,                         // music playing on the computer (comes with P1.3)
  idle: (s) => s.mood === 'listening' && s.idleSeconds >= IDLE_COFFEE_S,
});

// a part the mascot wears says "on": "body"; anything else (or an anchor this version does not know) stands still
export const ANCHORS = Object.freeze(['world', 'body']);
export const anchorOf = (part) => (ANCHORS.includes(part?.on) ? part.on : 'world');

export function pivotOf(part) {
  const at = part?.pivot;
  return Array.isArray(at) && at.length === 3 && at.every(Number.isFinite) ? at : [0, 0, 0];
}

const V = 0.1;                            // units per voxel, as in mascot3d.js
export const MASCOT_REACH = 1.6;          // the mascot with its arms, to each side of its middle (units)
const MARGIN = 0.15;

export function sceneSpan(scene) {
  let left = 0;
  let right = 0;
  for (const part of scene?.parts || []) {
    if (anchorOf(part) !== 'world') continue;         // what it wears is within the mascot's own reach
    for (const b of part.box ? [part.box] : part.boxes || []) {
      left = Math.min(left, (b[0] - b[3] / 2) * V);
      right = Math.max(right, (b[0] + b[3] / 2) * V);
    }
  }
  return [left, right];
}

// the screen shows halfWidth units to each side. A monitor beside the mascot may not fit: the camera first slides
// sideways, as little as it takes (the mascot keeps its size), and only pulls back when the mascot and the scene
// together are wider than the screen
export function frameFor(halfWidth, [left, right]) {
  const from = Math.min(-MASCOT_REACH, left - MARGIN);
  const to = Math.max(MASCOT_REACH, right + MARGIN);
  if (to - from > 2 * halfWidth) return { x: (from + to) / 2, halfWidth: (to - from) / 2 };
  return { x: Math.max(to - halfWidth, Math.min(from + halfWidth, 0)), halfWidth };
}

export function validScenes(data) {
  const list = Array.isArray(data?.scenes) ? data.scenes : [];
  return list.filter((s) => s && typeof s.id === 'string' && TRIGGERS[s.trigger] && Number.isFinite(s.priority)
    && Array.isArray(s.parts));
}

export function pickScene(scenes, situation) {
  let best = null;
  for (const scene of scenes) {
    if (TRIGGERS[scene.trigger](situation) && (!best || scene.priority > best.priority)) best = scene;
  }
  return best;
}
