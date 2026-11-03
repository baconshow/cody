// Tests for the shake (web/js/shake.js) and the startle it gives the animator: three strong jolts within the window
// grab, a single jolt does not, and it lets go 1.2 s after the last one; the force drops gravity when the phone only
// measures with it.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShake, shakeForce, SHAKE } from '../../web/js/shake.js';
import { createAnimator } from '../../web/js/animator.js';
import { seededRandom } from '../../web/js/seeded-random.js';

function scenario() {
  const st = { now: 0, changes: [] };
  const shake = createShake({ onChange: (v) => st.changes.push(v), clock: () => st.now });
  const jolt = (ms, force) => { st.now = ms; shake.measure(force); };
  return { st, jolt };
}

test('three strong jolts within the window: grabs; once it stops: lets go 1.2 s later', () => {
  const { st, jolt } = scenario();
  jolt(0, 12);
  jolt(200, 3);
  jolt(300, 11);
  assert.deepEqual(st.changes, []);
  jolt(500, 10);
  assert.deepEqual(st.changes, [true]);
  jolt(1200, 2);
  assert.deepEqual(st.changes, [true], 'still holding on');
  jolt(500 + SHAKE.release + 50, 1);
  assert.deepEqual(st.changes, [true, false]);
});

test('a single jolt (putting the phone on the desk) does not startle it', () => {
  const { st, jolt } = scenario();
  jolt(0, 30);
  jolt(1000, 30);
  jolt(2000, 30);
  assert.deepEqual(st.changes, []);
});

test('the jolt force: without gravity, with whatever sensor there is', () => {
  assert.equal(shakeForce({ acceleration: { x: 3, y: 4, z: 0 } }), 5);
  assert.ok(Math.abs(shakeForce({ acceleration: { x: null }, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } })) < 1e-9);
  assert.equal(shakeForce({}), 0);
  // an Android that sends the pure acceleration zeroed: the deviation of the one with gravity counts
  assert.ok(Math.abs(shakeForce({ acceleration: { x: 0, y: 0, z: 0 }, accelerationIncludingGravity: { x: 0, y: 0, z: 21.81 } }) - 12) < 1e-9);
});

test('the animator: grabbing gets close to 1 and lets go; with "reduce motion", it is not startled', () => {
  const animator = createAnimator({ random: seededRandom(1), mood: 'listening' });
  animator.setGrab(true);
  let q = null;
  for (let s = 0; s <= 1.5; s += 1 / 60) q = animator.step(s);
  assert.ok(Math.abs(q.grab - 1) < 0.08, `grab ${q.grab}`);
  animator.setGrab(false);
  for (let s = 1.5; s <= 4; s += 1 / 60) q = animator.step(s);
  assert.ok(Math.abs(q.grab) < 0.05);
  const quiet = createAnimator({ random: seededRandom(1), mood: 'listening', quiet: true });
  quiet.setGrab(true);
  assert.equal(quiet.step(1).grab, 0);
});

test('a jolt that lasts several readings (60 per second) counts only once', () => {
  const { st, jolt } = scenario();
  for (let ms = 0; ms <= 80; ms += 16) jolt(ms, 25);   // the phone hitting the desk
  jolt(400, 2);
  assert.deepEqual(st.changes, []);
});
