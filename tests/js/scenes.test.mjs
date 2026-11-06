import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validScenes, pickScene, anchorOf, pivotOf, sceneSpan, frameFor, createSceneSounds, MASCOT_REACH, TRIGGERS,
  IDLE_COFFEE_S, SOUND_GAP_S } from '../../web/js/scenes.js';

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

test('what the mascot wears is on its body; the rest stands around it', () => {
  const anchors = (id) => [...new Set(scenes.find((s) => s.id === id).parts.map(anchorOf))];
  assert.deepEqual(anchors('sleeping'), ['body'], 'the nightcap');
  assert.deepEqual(anchors('headphones'), ['body']);
  for (const id of ['coding', 'party', 'thinking']) assert.deepEqual(anchors(id), ['world'], id);
  assert.deepEqual(anchors('coffee'), ['body'], 'the mug is in its hand: a wide screen cuts off the floor in front');
  assert.deepEqual(anchors('debug').sort(), ['body', 'world'], 'the bug walks on its head, the sign stands beside it');
  assert.equal(anchorOf({ on: 'moon' }), 'world', 'an anchor this version does not know stands still');
  assert.equal(anchorOf({}), 'world');
});

test('a worn part grows and sways from its pivot; a bad pivot is the floor under the mascot', () => {
  assert.deepEqual(pivotOf({ pivot: [5.5, 19, 0] }), [5.5, 19, 0]);
  for (const bad of [undefined, 'top', [1, 2], [1, 2, 'x'], [1, 2, Infinity]]) assert.deepEqual(pivotOf({ pivot: bad }), [0, 0, 0]);
  for (const s of scenes) {
    for (const p of s.parts) if (anchorOf(p) === 'body') assert.notDeepEqual(pivotOf(p), [0, 0, 0], `${s.id}: a worn part needs a pivot`);
  }
});

test('the camera slides to keep a wide scene in the picture, and pulls back only if it must', () => {
  const span = (id) => sceneSpan(scenes.find((s) => s.id === id));
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} far from ${b}`);
  assert.deepEqual(span('sleeping'), [0, 0], 'what it wears does not widen the picture');
  assert.deepEqual(frameFor(2.55, [0, 0]), { x: 0, halfWidth: 2.55 }, 'no scene: the mascot in the middle');
  assert.deepEqual(frameFor(2.55, span('party')), { x: 0, halfWidth: 2.55 }, 'confetti all around already fits');

  const [, right] = span('coding');
  assert.ok(right > 2.55, 'the monitor does not fit beside the mascot on a wide phone');
  const wide = frameFor(2.55, span('coding'));
  assert.equal(wide.halfWidth, 2.55, 'same size');
  assert.ok(wide.x > 0, 'the camera went right, toward the monitor');
  assert.ok(wide.x + 2.55 >= right, 'the whole monitor is in');
  assert.ok(wide.x - 2.55 <= -MASCOT_REACH, 'and so is the mascot, arm included');

  const left = frameFor(2.55, span('debug'));
  assert.ok(left.x < 0 && left.halfWidth === 2.55, 'the sign is on the left: the camera goes left');

  const narrow = frameFor(2, span('coding'));
  assert.ok(narrow.halfWidth > 2, 'a narrow screen: it has to pull back');
  near(narrow.x - narrow.halfWidth, -MASCOT_REACH);
  assert.ok(narrow.x + narrow.halfWidth >= right);
});

test('a scene sounds when it comes in, not when it only comes back after a tap', () => {
  const sound = createSceneSounds();
  const debug = scenes.find((s) => s.id === 'debug');
  const party = scenes.find((s) => s.id === 'party');
  assert.equal(sound(debug, 100), 'error', 'a failure: the scene comes in with its sound');
  assert.equal(sound(party, 101), null, 'a tap shows the party, which has no sound');
  assert.equal(sound(debug, 102.6), null, 'the failure scene returns after the tap: silent');
  assert.equal(sound(debug, 100 + SOUND_GAP_S), 'error', 'a new failure later sounds again');
  assert.equal(sound(null, 0), null);
});
