// The keyboard's layout (web/js/keyboard3d.js): a real one seen from the viewer's seat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_SLOTS, KEYBOARD } from '../../web/js/keyboard3d.js';

// the rows, from the keys of plain depth (a tall keypad key sits between two rows)
const rows = [...new Set(KEY_SLOTS.keys.filter(([, , , d]) => d < 1.5 * KEYBOARD.key).map(([, z]) => z.toFixed(3)))].map(Number).sort((a, b) => a - b);
const inRow = (z) => KEY_SLOTS.keys.filter(([x, kz]) => Math.abs(kz - z) < 1e-6 && x < 1);   // the main block, not the keypad

test('five rows plus the keypad, the space bar nearest the viewer, Enter and the Shifts their real width', () => {
  assert.equal(KEY_SLOTS.keys.length, 78);
  assert.equal(rows.length, 5, 'five rows');
  const widest = KEY_SLOTS.keys.reduce((a, b) => (b[2] > a[2] ? b : a));
  assert.equal(widest[1], rows.at(-1), 'the space bar is in the nearest row');
  assert.ok(widest[2] > 5 * KEYBOARD.key, 'and much wider than a key');
  const homeRow = inRow(rows[2]).sort((a, b) => a[0] - b[0]);
  assert.ok(homeRow.at(-1)[2] > 2 * KEYBOARD.key, 'Enter, at the right end of the home row, is wide');
  const shiftRow = inRow(rows[3]).sort((a, b) => a[0] - b[0]);
  assert.ok(shiftRow[0][2] > 2 * KEYBOARD.key && shiftRow.at(-1)[2] > 2 * KEYBOARD.key, 'two wide Shifts');
  const tall = KEY_SLOTS.keys.filter(([, , , d]) => d > 1.5 * KEYBOARD.key);
  assert.equal(tall.length, 2, "the keypad's + and Enter are two rows tall");
  assert.ok(tall.every(([x]) => x > 1), 'on the right, in the keypad');
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
