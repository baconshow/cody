import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validScenes, pickScene, pickOver, wantedScene, anchorOf, pivotOf, sceneSpan, frameFor, createSceneSounds, MASCOT_REACH,
  TRIGGERS, IDLE_COFFEE_S, SOUND_GAP_S } from '../../web/js/scenes.js';

const data = JSON.parse(readFileSync(new URL('../../web/scenes/scenes.json', import.meta.url)));
const scenes = validScenes(data);
const situation = (s) => ({ mood: 'listening', reading: {}, idleSeconds: 0, happy: false, ...s });
const pick = (s) => pickScene(scenes, situation(s))?.id ?? null;
const over = (s) => pickOver(scenes, situation(s))?.id ?? null;

test('the essential scenes are there, all valid', () => {
  assert.deepEqual(scenes.map((s) => s.id).sort(),
    ['coding', 'coffee', 'debug', 'dizzy', 'headphones', 'knock', 'laugh', 'love', 'party', 'sleeping', 'stars', 'thinking', 'wink']);
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
  assert.equal(over({ reading: { music: true } }), 'headphones');
  assert.equal(pick({ mood: 'resting' }), 'sleeping');
  assert.equal(pick({ knock: true, reading: { failed: true } }), 'knock', 'Claude needs you: the knock, above a failure');
});

test('the highest priority wins: a failure beats coding, a party beats sleeping', () => {
  assert.equal(pick({ reading: { code: true, failed: true } }), 'debug');
  assert.equal(pick({ mood: 'resting', happy: true }), 'party');
});

test('the headphones go over whatever else is going on, and never take its place', () => {
  const music = { reading: { music: true, code: true } };
  assert.equal(pick(music), 'coding', 'the monitor stays up');
  assert.equal(over(music), 'headphones', 'and the headphones are on');
  assert.equal(pick({ reading: { music: true } }), null, 'music alone is not a scene of its own');
  assert.equal(over({ reading: { code: true } }), null);
  assert.equal(over({ mood: 'resting', reading: { music: true } }), 'headphones', 'asleep with the music on: both');
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
  assert.deepEqual(anchors('knock'), ['body'], 'the impact marks ride with the fist');
  for (const id of ['coding', 'party']) assert.deepEqual(anchors(id), ['world'], id);
  assert.deepEqual(anchors('thinking'), ['body'], 'the thought bubble floats in front of the face and turns with it');
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
  assert.equal(sound(party, 112), null, 'a tap, late in a long failure, shows the party, which has no sound');
  assert.equal(sound(debug, 113.6), null, 'the failure scene returns after the tap: silent, however long it had been on');
  assert.equal(sound(null, 120), null, 'the failure is over: no scene');
  assert.equal(sound(debug, 120 + SOUND_GAP_S), 'error', 'a new failure after a real pause sounds again');
  assert.equal(sound(null, 130), null);
  assert.equal(sound(debug, 131), null, 'back within the gap: still the same moment');
});

test('a broken box in a scene cannot take the camera away', () => {
  const broken = { parts: [{ boxes: [[1, 2, 3], null, [NaN, 0, 0, 4, 1, 1], [30, 10, 0, 4, 4, 1]] }, { box: 'x' }] };
  assert.deepEqual(sceneSpan(broken), [0, 3.2], 'only the whole box counts');
  for (const span of [sceneSpan(broken), [NaN, NaN], [0, Infinity]]) {
    const frame = frameFor(2.55, span);
    assert.ok(Number.isFinite(frame.x) && Number.isFinite(frame.halfWidth), `${span}`);
  }
  assert.deepEqual(frameFor(2.55, [NaN, 1]), { x: 0, halfWidth: 2.55 });
});

test('a scene asked for by voice goes above the pick: worn in the over slot, the rest in the scene slot', () => {
  const custom = validScenes({ scenes: [{ id: 'rainbow', trigger: 'request', priority: 45, parts: [{ boxes: [[0, 24, 0, 30, 1.5, 1.5]] }] }] });
  assert.equal(custom.length, 1, 'request is a trigger that never fires on its own');
  assert.equal(pick({ reading: { wanted: 'rainbow' } }), null);
  const all = [...scenes, ...custom];
  const coding = situation({ reading: { code: true, wanted: 'rainbow' } });
  assert.deepEqual(wantedScene(all, coding, 'coding', null), { scene: 'rainbow', over: null }, 'the wish wins over coding');
  assert.deepEqual(wantedScene(all, situation({ reading: { wanted: 'headphones' } }), 'coding', null), { scene: 'coding', over: 'headphones' });
  assert.deepEqual(wantedScene(all, situation({ reading: { wanted: 'moon' } }), 'coding', null), { scene: 'coding', over: null }, 'an unknown wish changes nothing');
  assert.deepEqual(wantedScene(all, situation({}), null, null), { scene: null, over: null });
});

test('the reaction scenes change the eyes: hearts, dizzy, laughing, a wink, stars; the party and the bug have theirs too', () => {
  const byId = Object.fromEntries(scenes.map((s) => [s.id, s]));
  assert.deepEqual(byId.love.eyes, ['heart', 'heart']);
  assert.deepEqual(byId.dizzy.eyes, ['dot', 'cross']);
  assert.deepEqual(byId.laugh.eyes, ['chevron', 'chevron']);
  assert.deepEqual(byId.wink.eyes, ['bang', 'chevron']);
  assert.deepEqual(byId.stars.eyes, ['star', 'star']);
  for (const id of ['love', 'dizzy', 'laugh', 'wink', 'stars']) assert.equal(byId[id].trigger, 'request', `${id} shows only when asked`);
  assert.deepEqual(byId.party.eyes, ['star', 'star'], 'a long task done: starstruck');
  assert.deepEqual(byId.debug.eyes, ['dot', 'cross'], 'a failure: dizzy');
  assert.equal(byId.coding.eyes, undefined);
  const odd = validScenes({ scenes: [{ id: 'x', trigger: 'request', priority: 1, parts: [], eyes: 'moon' }] });
  assert.equal(odd[0].eyes, undefined, 'a shape this version does not know is left out, the scene stays');
});
