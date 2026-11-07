// The keyboard's layout (web/js/keyboard3d.js): a real one from the mascot's seat, and which key its hands press.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_SLOTS, KEYBOARD, pickKey } from '../../web/js/keyboard3d.js';

// the rows, from the keys of plain depth (a tall keypad key sits between two rows), from the mascot to the viewer
const rows = [...new Set(KEY_SLOTS.keys.filter(([, , , d]) => d < 1.5 * KEYBOARD.key).map(([, z]) => z.toFixed(3)))].map(Number).sort((a, b) => a - b);
// where the main block (15 keys wide, from the mascot's left, +x) ends and the keypad begins
const PAD_EDGE = KEY_SLOTS.width / 2 - KEYBOARD.margin - 15 * (KEYBOARD.key + KEYBOARD.gap);
const inRow = (z) => KEY_SLOTS.keys.filter(([x, kz]) => Math.abs(kz - z) < 1e-6 && x > PAD_EDGE);   // the main block, not the keypad

test('five rows plus the keypad, laid out from the mascot\'s seat: the space bar by it, the numbers by the viewer', () => {
  assert.equal(KEY_SLOTS.keys.length, 78);
  assert.equal(rows.length, 5, 'five rows');
  const widest = KEY_SLOTS.keys.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.equal(widest[1], rows[0], 'the space bar is in the row nearest the mascot');
  assert.ok(widest[1] < 0, 'which is the far side from the viewer (+z)');
  assert.ok(widest[2] > 5 * KEYBOARD.key, 'and much wider than a key');
  const numbers = inRow(rows.at(-1)).sort((a, b) => a[0] - b[0]);
  assert.equal(numbers.length, 14, 'the number row, nearest the viewer, with Backspace');
  assert.ok(numbers[0][2] > 1.5 * KEYBOARD.key, 'Backspace at the mascot\'s right end (the viewer\'s left)');
  const homeRow = inRow(rows[2]).sort((a, b) => a[0] - b[0]);
  assert.ok(homeRow[0][2] > 2 * KEYBOARD.key, 'Enter, at the mascot\'s right end of the home row, is wide');
  const shiftRow = inRow(rows[1]).sort((a, b) => a[0] - b[0]);
  assert.ok(shiftRow[0][2] > 2 * KEYBOARD.key && shiftRow.at(-1)[2] > 2 * KEYBOARD.key, 'two wide Shifts');
  const tall = KEY_SLOTS.keys.filter(([, , , d]) => d > 1.5 * KEYBOARD.key);
  assert.equal(tall.length, 2, "the keypad's + and Enter are two rows tall");
  assert.ok(tall.every(([x]) => x < PAD_EDGE), 'in the keypad, on the mascot\'s right');
});

test('no two keys overlap, and all of them sit on the base', () => {
  const keys = KEY_SLOTS.keys;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const [ax, az, aw, ad] = keys[i];
      const [bx, bz, bw, bd] = keys[j];
      const apart = Math.abs(ax - bx) >= (aw + bw) / 2 - 1e-9 || Math.abs(az - bz) >= (ad + bd) / 2 - 1e-9;
      assert.ok(apart, `keys ${i} and ${j} overlap`);
    }
    const [x, z, w, d] = keys[i];
    assert.ok(Math.abs(x) + w / 2 <= KEY_SLOTS.width / 2 && Math.abs(z) + d / 2 <= KEY_SLOTS.depth / 2, `key ${i} off the base`);
  }
});

test('the pressed key is under the hand that is down: the left hand (+x) on even beats, the right on odd ones', () => {
  const beat = Math.PI / KEYBOARD.rhythm;
  const seen = new Set();
  for (let n = 0; n < 40; n++) {
    const i = pickKey(n * beat + beat / 2);
    const [x] = KEY_SLOTS.keys[i];
    assert.ok(n % 2 === 0 ? x > KEY_SLOTS.width / 3 : x < -KEY_SLOTS.width / 3, `beat ${n}: key ${i} at x ${x}`);
    assert.equal(pickKey(n * beat + beat * 0.9), i, 'the same key for the whole beat');
    seen.add(i);
  }
  assert.ok(seen.size > 10, `different keys over time (${seen.size})`);
  assert.ok(pickKey(12.34) === pickKey(12.34), 'the same instant, the same key');
});
