// scenes.js — which scene the mascot is in. A scene is data (web/scenes/scenes.json: voxel pieces, trigger, clips,
// sound, priority), so a skin or a community scene is just another entry. This file only decides: of the scenes
// whose trigger is on, the one with the highest priority. Pure logic, run in Node by the tests.
//
//   pickScene(scenes, situation) → scene | null
//   situation: { mood, reading, idleSeconds, happy } (cycle.js situation())
//   anchorOf(part) → 'body' (worn: it moves with the mascot) | 'world' (it stands around it)
//   pivotOf(part) → [x, y, z] in voxels: where a part grows from and sways around

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
