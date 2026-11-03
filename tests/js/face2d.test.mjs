// Tests for the 2D face drawing (web/js/face2d.js, measures.js, eyes2d.js, decorations2d.js): where the mascot
// fits, whether every edge lands on a whole pixel (the hard pixel edge) and what each mood puts on screen. The
// canvas is a fake: it records every painted rectangle.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawFace, measures } from '../../web/js/face2d.js';
import { COLOR, BODY, EYE } from '../../web/js/measures.js';
import { lettersAt, sizeAt, RHYTHM, ZZZ } from '../../web/js/decorations2d.js';
import { createAnimator } from '../../web/js/animator.js';
import { MOODS } from '../../web/js/moods.js';
import { seededRandom } from '../../web/js/seeded-random.js';

function fakeCanvas() {
  const painted = [];
  return {
    painted,
    fillStyle: '#000',
    fillRect(x, y, w, h) { painted.push({ x, y, w, h, color: this.fillStyle }); },
  };
}

function poseAt(mood, seconds, quiet = false) {
  const an = createAnimator({ random: seededRandom(5), mood, quiet });
  let q = null;
  for (let s = 0; s <= seconds + 1e-9; s += 1 / 60) q = an.step(s);
  return q;
}

function draw(mood, width, height, seconds = 3, quiet = false) {
  const ctx = fakeCanvas();
  const meas = measures(width, height);
  drawFace(ctx, poseAt(mood, seconds, quiet), meas);
  return { ctx, meas, painted: ctx.painted.slice(1) };   // the first one is the background
}

test('phone in landscape (844 × 390): peeks up from the bottom edge, big face, whole-pixel voxels', () => {
  const meas = measures(844, 390);
  assert.equal(meas.mode, 'peek');
  assert.ok(Number.isInteger(meas.u) && meas.u >= 20, `u = ${meas.u}`);
  assert.ok(meas.oy + meas.u * (EYE.top + EYE.height) < 390, 'both eyes fully on screen');
  assert.ok(meas.oy + meas.u * BODY.height > 390, 'the body runs off the bottom edge');
});

test('small tile (220 × 160): the whole mascot, legs and sprout inside the screen', () => {
  const { meas, painted } = draw('listening', 220, 160);
  assert.equal(meas.mode, 'full');
  assert.ok(Number.isInteger(meas.u) && meas.u >= 5, `u = ${meas.u}`);
  for (const p of painted) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 220 && p.y + p.h <= 160, `off screen: ${JSON.stringify(p)}`);
  }
});

test('every edge lands on a whole pixel, in every mood and size', () => {
  for (const mood of MOODS) {
    for (const [w, h] of [[844, 390], [220, 160], [383, 255], [1688, 780]]) {
      for (const p of draw(mood, w, h, 2.7).painted) {
        assert.ok([p.x, p.y, p.w, p.h].every(Number.isInteger), `${mood} ${w}×${h}: ${JSON.stringify(p)}`);
        assert.ok(p.w > 0 && p.h > 0);
      }
    }
  }
});

test('the mascot eyes: black bars taller than wide, with the white glint on top', () => {
  const { painted } = draw('listening', 844, 390);
  const eyes = painted.filter((p) => p.color === COLOR.eye);
  assert.equal(eyes.length, 2);
  for (const e of eyes) assert.ok(e.h > 2 * e.w, `bar ${e.w} × ${e.h}`);
  const glints = painted.filter((p) => p.color === COLOR.glint);
  assert.equal(glints.length, 2);
  for (const g of glints) assert.ok(eyes.some((e) => g.y === e.y && g.x === e.x));
});

test('happy and resting swap the bar for arcs; sleepy gets the eyelid crease', () => {
  const eyeHeight = (mood) => Math.max(...draw(mood, 844, 390).painted.filter((p) => p.color === COLOR.eye).map((p) => p.h));
  const open = eyeHeight('listening');
  assert.ok(eyeHeight('happy') < open / 3, 'arc: all in low steps');
  assert.ok(eyeHeight('resting') < open / 3);
  const sleepy = draw('sleepy', 844, 390).painted;
  assert.equal(sleepy.filter((p) => p.color === COLOR.eyelid).length, 2);
  assert.ok(Math.max(...sleepy.filter((p) => p.color === COLOR.eye).map((p) => p.h)) < open * 0.75);
});

test('the mouth only shows while talking; the bubbles only while thinking; the z letters only when sleepy', () => {
  const has = (mood, color, s = 3) => draw(mood, 844, 390, s).painted.some((p) => p.color === color);
  assert.equal(has('listening', COLOR.mouth), false);
  assert.ok([2, 2.5, 3, 3.5].some((s) => has('talking', COLOR.mouth, s)));
  assert.equal(has('thinking', COLOR.bubbles[2]), true);
  assert.equal(has('happy', COLOR.bubbles[2]), false);
  assert.equal(has('resting', COLOR.letters[0]) || has('resting', COLOR.letters[1]), true);
  assert.equal(has('listening', COLOR.letters[0]), false);
});

test('reduce motion: the bubbles and the "zZ" stand still, all at once', () => {
  const thinking = draw('thinking', 844, 390, 0, true).painted;
  assert.equal(COLOR.bubbles.filter((color) => thinking.some((p) => p.color === color)).length, 3);
  const resting = draw('resting', 844, 390, 0, true).painted;
  assert.ok(resting.some((p) => p.color === COLOR.letters[0]) && resting.some((p) => p.color === COLOR.letters[1]));
});

test('the z letters: resting, z z Z every 1.5 s; sleepy, only the small ones every 3 s', () => {
  assert.deepEqual(lettersAt('resting', 0).map((l) => l.letter), [0]);
  assert.deepEqual(lettersAt('resting', 3.1).map((l) => l.letter), [0, 1, 2]);
  const alive = lettersAt('resting', 20);
  assert.ok(alive.length === Math.ceil(ZZZ.life / RHYTHM.resting.interval));
  assert.ok(lettersAt('sleepy', 30).every((l) => l.letter < 2));
  assert.deepEqual(lettersAt('happy', 5), []);
  assert.equal(sizeAt(0.5), 1);
  assert.equal(sizeAt(1), 0);
});
