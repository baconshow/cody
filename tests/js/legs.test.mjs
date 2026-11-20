// The hips follow the body's underside (web/js/mascot3d.js, hipRise): when the mascot looks up, the body pitches
// back about the figure's x axis and its underside rises at the front, so the front hips rise with it and the
// inner (back) hips sink, and no leg comes loose; looking down is the opposite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hipRise } from '../../web/js/mascot3d.js';

const FRONT_LEFT = { x: -0.95, z: 0.35 };   // leg 0, in front at the mascot's right (the viewer's left)
const FRONT_RIGHT = { x: 0.95, z: 0.35 };   // leg 3
const BACK_LEFT = { x: -0.45, z: -0.3 };    // leg 1, set back
const UP = -0.85;                            // the gaze while thinking (up, toward the thought bubble)

test('looking straight ahead, every hip rests at its usual height', () => {
  for (const leg of [FRONT_LEFT, FRONT_RIGHT, BACK_LEFT]) assert.equal(hipRise(leg, 0, 0) + 0, 0);   // -0 counts
});

test('looking up, the front hips rise and the back hips sink, in proportion to how far from the middle they are', () => {
  const front = hipRise(FRONT_LEFT, 0, UP);
  assert.ok(front > 0.03 && front < 0.06, `front ${front}`);
  assert.equal(hipRise(FRONT_RIGHT, 0, UP), front);                        // both front legs the same, feet straight
  const back = hipRise(BACK_LEFT, 0, UP);
  assert.ok(back < 0, `back ${back}`);
  assert.ok(Math.abs(back / front - BACK_LEFT.z / FRONT_LEFT.z) < 1e-9);   // the underside is a plane
});

test('looking down mirrors looking up', () => {
  assert.ok(Math.abs(hipRise(FRONT_LEFT, 0, 0.85) + hipRise(FRONT_LEFT, 0, UP)) < 1e-12);
});

test('with the feet turned, the leg that comes to the front is the one that rises', () => {
  const quarter = Math.PI / 2;                                             // the feet turned a quarter to the left
  const nowInFront = hipRise(FRONT_LEFT, quarter, UP);                     // x = -0.95 swings to z = +0.95
  const nowBehind = hipRise(FRONT_RIGHT, quarter, UP);                     // x = +0.95 swings to z = -0.95
  assert.ok(nowInFront > hipRise(FRONT_LEFT, 0, UP), `in front ${nowInFront}`);
  assert.ok(nowBehind < 0, `behind ${nowBehind}`);
  assert.ok(Math.abs(nowInFront + nowBehind) < 1e-9);
});
