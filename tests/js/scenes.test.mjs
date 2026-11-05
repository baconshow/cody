import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validScenes, pickScene, TRIGGERS, IDLE_COFFEE_S } from '../../web/js/scenes.js';

const data = JSON.parse(readFileSync(new URL('../../web/scenes/scenes.json', import.meta.url)));
const scenes = validScenes(data);
const pick = (s) => pickScene(scenes, { mood: 'listening', reading: {}, idleSeconds: 0, happy: false, ...s })?.id ?? null;

test('the seven essential scenes are there, all valid', () => {
  assert.deepEqual(scenes.map((s) => s.id).sort(),
    ['coding', 'coffee', 'debug', 'headphones', 'party', 'sleeping', 'thinking']);
  assert.equal(scenes.length, data.scenes.length);
  for (const s of scenes) for (const p of s.parts) assert.ok(p.sign || p.boxes.every((b) => b.length === 6), s.id);
});

test('each trigger shows its scene', () => {
  assert.equal(pick({ reading: { code: true } }), 'coding');
  assert.equal(pick({ mood: 'thinking' }), 'thinking');
  assert.equal(pick({ idleSeconds: IDLE_COFFEE_S }), 'coffee');
  assert.equal(pick({ idleSeconds: IDLE_COFFEE_S - 1 }), null);
  assert.equal(pick({ reading: { failed: true } }), 'debug');
  assert.equal(pick({ happy: true }), 'party');
  assert.equal(pick({ reading: { music: true } }), 'headphones');
  assert.equal(pick({ mood: 'resting' }), 'sleeping');
});

test('the highest priority wins: a failure beats coding, a party beats sleeping', () => {
  assert.equal(pick({ reading: { code: true, failed: true } }), 'debug');
  assert.equal(pick({ mood: 'resting', happy: true }), 'party');
});

test('a scene with an unknown trigger is left out (community scenes cannot break the page)', () => {
  assert.equal(validScenes({ scenes: [{ id: 'x', trigger: 'moon', priority: 1, parts: [] }] }).length, 0);
  assert.equal(validScenes(null).length, 0);
  assert.ok(Object.keys(TRIGGERS).length >= 7);
});
