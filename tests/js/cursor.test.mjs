// Tests for the computer's mouse on the mascot's face (web/js/cursor.js): reports only when the pointer moves,
// ignores an empty read (off Windows), passes on the mini Cody pointing, and does not start without a token.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCursor, CURSOR } from '../../web/js/cursor.js';

function scenario(positions, token = true) {
  const seen = [];
  const api = { hasToken: () => token, cursor: async () => positions.shift() ?? { x: null, y: null } };
  return { seen, cursor: createCursor({ api, onMove: (p) => seen.push(p) }) };
}

test('reports when the pointer moves and stays quiet when it stops', async () => {
  const { seen, cursor } = scenario([{ x: 0.1, y: -0.2 }, { x: 0.1, y: -0.2 }, { x: 0.1 + CURSOR.minimum / 4, y: -0.2 }, { x: 0.5, y: 0.3 }]);
  for (let i = 0; i < 4; i++) assert.equal(await cursor.readNow(), true);
  assert.deepEqual(seen, [{ x: 0.1, y: -0.2, pointing: false }, { x: 0.5, y: 0.3, pointing: false }]);
});

test('the spot the mini Cody points at comes with pointing: true', async () => {
  const { seen, cursor } = scenario([{ x: -0.4, y: 0.6, pointing: true }]);
  await cursor.readNow();
  assert.deepEqual(seen, [{ x: -0.4, y: 0.6, pointing: true }]);
});

test('an empty read (off Windows, locked screen) does not move the gaze', async () => {
  const { seen, cursor } = scenario([{ x: null, y: null }]);
  assert.equal(await cursor.readNow(), false);
  assert.deepEqual(seen, []);
});

test('does not start without a token', () => {
  let asked = false;
  const api = { hasToken: () => false, cursor: async () => { asked = true; return { x: 0, y: 0 }; } };
  const cursor = createCursor({ api, onMove: () => {} });
  cursor.start();
  cursor.stop();
  assert.equal(asked, false);
});
