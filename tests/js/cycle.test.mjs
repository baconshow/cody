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
