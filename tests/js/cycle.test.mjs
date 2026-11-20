// Tests for the idle cycle (web/js/cycle.js): with no signal from Claude the face listens, thinks for a bit, gets
// sleepy and rests; the pointer coming back or a touch wakes it up happy.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCycle, CYCLE } from '../../web/js/cycle.js';

test('the idle cycle: listens, thinks a little, gets sleepy, rests; the pointer coming back wakes it up happy', () => {
  const c = createCycle();
  assert.equal(c.mood(0), 'listening');
  assert.equal(c.mood(CYCLE.think[0] + 1), 'thinking');
  assert.equal(c.mood(CYCLE.think[1] + 1), 'listening');
  assert.equal(c.mood(CYCLE.sleepy + 1), 'sleepy');
  assert.equal(c.mood(CYCLE.rest + 1), 'resting');
  c.moved(CYCLE.rest + 2);
  assert.equal(c.mood(CYCLE.rest + 2.5), 'happy');
  assert.equal(c.mood(CYCLE.rest + 2 + CYCLE.celebrate + 0.1), 'listening');
  c.touched(200);
  assert.equal(c.mood(200.5), 'happy');
  const fast = createCycle({ fast: true });
  fast.mood(0);
  assert.equal(fast.mood(CYCLE.rest / 6 + 0.1), 'resting');
});

test('a knock alert: the mood points, knocking() is on and the scenes see it, until it is over', () => {
  const cycle = createCycle();
  cycle.mood(0);
  cycle.alert('pointing', 8, 10, 'knock');
  assert.equal(cycle.mood(11), 'pointing');
  assert.equal(cycle.knocking(11), true);
  assert.equal(cycle.situation(11).knock, true);
  assert.equal(cycle.knocking(18.5), false);
  assert.equal(cycle.situation(18.5).knock, false);
  cycle.alert('pointing', 8, 20);                      // the mini Cody pointing: no knock
  assert.equal(cycle.mood(21), 'pointing');
  assert.equal(cycle.knocking(21), false);
});

test('a pat is the happy face, never the party: the confetti is for an agent that finished', () => {
  const finished = { n: 0 };
  const c = createCycle({ signal: { read: () => ({ finished: finished.n, idleSeconds: 0 }) } });
  c.mood(0);
  c.touched(10);
  assert.equal(c.mood(10.5), 'happy');
  assert.equal(c.situation(10.5).happy, false, 'no celebration: the party scene stays away');
  finished.n = 1;
  assert.equal(c.situation(11).happy, true, 'an agent finished: now it is a party');
  c.cheer(30);
  assert.equal(c.situation(30.5).happy, true, 'a timer ringing celebrates too');
  assert.equal(c.situation(30 + CYCLE.celebrate + 0.1).happy, false);
});

