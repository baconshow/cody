// Tests for the eyes a scene can give the mascot (web/js/eyeshapes.js): the shapes, the mirrored right eye, how a
// scene's "eyes" field is read, and the runs the 3D figure is built from.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EYE_SHAPES, EYE_SHAPE_NAMES, eyeRows, eyesOf } from '../../web/js/eyeshapes.js';

test('six shapes, every one a rectangle of cells', () => {
  assert.deepEqual(EYE_SHAPE_NAMES, ['dot', 'cross', 'chevron', 'heart', 'bang', 'star']);
  for (const [name, rows] of Object.entries(EYE_SHAPES)) {
    assert.ok(rows.length >= 4 && rows.length <= 10, `${name}: ${rows.length} rows`);
    assert.ok(rows.every((r) => r.length === rows[0].length && /^[#.]+$/.test(r)), `${name}: ragged or odd cells`);
    assert.ok(rows.some((r) => r.includes('#')), `${name}: empty`);
  }
});

test('the right eye is the mirror of the left: the chevron is > then <', () => {
  assert.equal(eyeRows('chevron', 0)[0], '##....');
  assert.equal(eyeRows('chevron', 1)[0], '....##');
  assert.deepEqual(eyeRows('heart', 1), eyeRows('heart', 0), 'a symmetric shape mirrors into itself');
  assert.equal(eyeRows('moon', 0), null);
});

test('a scene says one shape for both eyes, or one for each; anything else is no eyes at all', () => {
  assert.deepEqual(eyesOf('heart'), ['heart', 'heart']);
  assert.deepEqual(eyesOf(['dot', 'cross']), ['dot', 'cross']);
  assert.equal(eyesOf('moon'), null);
  assert.equal(eyesOf(['dot']), null);
  assert.equal(eyesOf(['dot', 'moon']), null);
  assert.equal(eyesOf(undefined), null);
  assert.equal(eyesOf({ left: 'dot' }), null);
});

