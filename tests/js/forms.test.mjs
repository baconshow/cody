// The shapes a skin may ask for besides boxes (web/js/forms.js): what is accepted from the data, and the math
// behind the ribbed body, the rounded corners and the tube's radius. Pure logic, no page and no three.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validShapes, gourdOf, carveOf, roundedRect, ribs, ribBump, gourdScale, roundCorners, radiusAt, LIMIT,
} from '../../web/js/forms.js';

const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

test('a tube, a lathe and a plate are kept, each with a place, a turn and no look of its own unless given', () => {
  const [tube, lathe, plate] = validShapes([
    { kind: 'tube', path: [[0, 0, 0], [0, 2, 0]], radius: 1 },
    { kind: 'lathe', profile: [[0, 0], [3, 0], [0, 1]], wave: [0.5, 2.4, 30], color: '#112233', finish: 'leather' },
    { kind: 'plate', outline: [[0, 0], [2, 0], [2, 2]], at: [1, 2, 3], turn: [10, 0, 0], glow: '#ffcc00' },
  ]);
  assert.deepEqual(tube.radius, [1], 'one number is the same radius all along');
  assert.deepEqual([tube.at, tube.turn, tube.color, tube.glow, tube.finish, tube.sway], [[0, 0, 0], [0, 0, 0], null, null, null, 0]);
  assert.equal(validShapes([{ kind: 'tube', path: [[0, 0, 0], [0, 2, 0]], radius: 1, sway: 7 }])[0].sway, 1, 'a share of the swing, at most all of it');
  assert.equal(tube.ridges, 0);
  assert.deepEqual(lathe.wave, [0.5, 2, 30], 'the wave goes around a whole number of times');
  assert.equal(lathe.color, '#112233');
  assert.equal(lathe.finish, 'leather');
  assert.deepEqual([plate.at, plate.turn, plate.glow, plate.hole], [[1, 2, 3], [10, 0, 0], '#ffcc00', null]);
});

test('what cannot be built is dropped, and wild numbers are brought back in range', () => {
  const kept = validShapes([
    null, { kind: 'sphere' }, { kind: 'tube', path: [[0, 0, 0]], radius: 1 }, { kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: [-1] },
    { kind: 'tube', path: [[0, 0, 0], [0, 1]], radius: 1 }, { kind: 'lathe', profile: [[-1, 0], [2, 0]] },
    { kind: 'plate', outline: [[0, 0], [1, 0]] }, { kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: [] },
    { kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 1, ridges: 99, ridge: 7, color: 'red', finish: 'gold',
      bands: [{ span: [0.2, 0.1] }, { span: [0.1, 0.3], lift: 50, color: '#abcdef' }, 'no'] },
  ]);
  assert.equal(kept.length, 1, 'only the last one can be built');
  assert.deepEqual([kept[0].ridges, kept[0].ridge, kept[0].color, kept[0].finish], [16, 0.5, null, null]);
  assert.equal(kept[0].bands.length, 1, 'a band needs a span that goes forward');
  assert.deepEqual([kept[0].bands[0].lift, kept[0].bands[0].color], [2, '#abcdef']);
  assert.deepEqual(validShapes('no'), []);
  assert.equal(validShapes(Array.from({ length: 60 }, () => ({ kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 1 }))).length, LIMIT.shapes);
});

test('a gourd body fills in what is missing and refuses any other form', () => {
  assert.equal(gourdOf(null), null);
  assert.equal(gourdOf({ form: 'ball' }), null);
  const plain = gourdOf({ form: 'gourd' });
  assert.deepEqual([plain.ribs, plain.crown, plain.round], [24, [0, 0], 3.2]);
  const wild = gourdOf({ form: 'gourd', ribs: 500, groove: -3, round: 1, crown: [40, -40], uneven: 9 });
  assert.deepEqual([wild.ribs, wild.groove, wild.round, wild.crown, wild.uneven], [LIMIT.ribs, 0, 2, [8, -5], 0.4]);
});

test('a carved mouth needs an outline; the light and the cut get colors if none are given', () => {
  assert.equal(carveOf(null), null);
  assert.equal(carveOf({ outline: [[0, 0], [1, 1]] }), null);
  const carve = carveOf({ outline: [[-1, 0], [1, 0], [0, 1]], glow: ['#ffffff', 'yellow'], depth: 99 });
  assert.deepEqual([carve.at, carve.depth, carve.glow, carve.wall], [[0, 10], 3, ['#ffffff', '#ffb21f'], '#f58a1a']);
  assert.deepEqual(carveOf({ outline: [[-1, 0], [1, 0], [0, 1]], at: [2, 9] }).at, [2, 9]);
});

test('the rounded section starts at the front middle, goes around once and always points outward', () => {
  const section = roundedRect(1.2, 0.8, 0.4);
  assert.ok(near(section.length, 4 * 0.8 + 4 * 0.4 + Math.PI * 2 * 0.4));
  assert.deepEqual(section.at(0), { x: 0, z: 0.8, nx: -0, nz: 1 });
  const side = section.at(0.8 + (Math.PI / 2) * 0.4 + 0.4);            // the middle of the right side
  assert.ok(near(side.x, 1.2) && near(side.z, 0) && near(side.nx, 1) && near(side.nz, 0, 1e-9));
  const back = section.at(section.length / 2);
  assert.ok(near(back.x, 0) && near(back.z, -0.8) && near(back.nz, -1));
  for (let i = 0; i < 200; i += 1) {
    const p = section.at((section.length * i) / 200);
    assert.ok(near(Math.hypot(p.nx, p.nz), 1, 1e-9), 'a unit normal');
    assert.ok(Math.abs(p.x) <= 1.2 + 1e-9 && Math.abs(p.z) <= 0.8 + 1e-9, 'inside the box');
    assert.ok(p.x * p.nx + p.z * p.nz > 0, 'the normal points away from the middle');
  }
  const again = section.at(section.length + 0.3);
  assert.ok(near(again.x, section.at(0.3).x) && near(again.z, section.at(0.3).z), 'it wraps around');
  assert.deepEqual(roundedRect(1, 1, 0).at(1), { x: 1, z: 1, nx: -0, nz: 1 }, 'no rounding: a plain rectangle');
});

test('the ribs: one more edge than ribs, the first rib over the front middle, the same every time', () => {
  const even = ribs(24, 7.2);
  assert.equal(even.length, 25);
  assert.ok(near(even[0], -0.15) && near(even[1], 0.15), 'the first rib is centred on s = 0');
  assert.ok(near(even[24] - even[0], 7.2), 'the last edge is the first one, a whole turn later');
  const uneven = ribs(24, 7.2, 0.3);
  assert.deepEqual(uneven, ribs(24, 7.2, 0.3), 'seeded: the same pumpkin on every screen');
  assert.ok(uneven.some((e, i) => !near(e, even[i])), 'the edges moved');
  for (let i = 0; i < 24; i += 1) assert.ok(uneven[i + 1] > uneven[i], 'still in order');
  assert.ok(near(uneven[24] - uneven[0], 7.2));
});

test('a rib is round on top and steep into the groove', () => {
  assert.equal(ribBump(0), 0);
  assert.ok(near(ribBump(0.5), 1));
  assert.ok(ribBump(0.1) > 0.5);
  assert.ok(near(ribBump(0.3), ribBump(0.7)), 'the same on both sides');
});

test('the gourd is widest at the middle and closes at both ends; rounder numbers make it boxier', () => {
  assert.equal(gourdScale(0, 4), 1);
  assert.equal(gourdScale(1, 4), 0);
  assert.equal(gourdScale(-1, 4), 0);
  assert.equal(gourdScale(3, 4), 0, 'beyond the end is the end');
  assert.ok(gourdScale(0.8, 6) > gourdScale(0.8, 3));
  assert.ok(near(gourdScale(0.6, 2), 0.8), 'round 2 is a ball');
});

test('rounded corners stay inside the polygon and leave short sides standing', () => {
  const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
  assert.deepEqual(roundCorners(square, 0), square);
  assert.notEqual(roundCorners(square, 0)[0], square[0], 'a copy');
  const round = roundCorners(square, 1, 4);
  assert.equal(round.length, 4 * 5);
  for (const [x, y] of round) assert.ok(x >= 0 && x <= 4 && y >= 0 && y <= 4);
  assert.ok(!round.some(([x, y]) => x === 0 && y === 0), 'the sharp corner is gone');
  assert.deepEqual(round[0], [0, 1], 'the arc starts one radius before the corner');
  const sliver = roundCorners([[0, 0], [0.2, 0], [0.2, 4], [0, 4]], 1, 2);
  assert.ok(near(sliver[2][0], 0.09), 'a cut takes at most 45% of a side');
  assert.deepEqual(roundCorners([[0, 0], [1, 1]], 1), [[0, 0], [1, 1]], 'not a polygon: left alone');
});

test('the radius along a tube: the given values at their places, smooth in between, flat past the ends', () => {
  assert.equal(radiusAt(2, 0.7), 2);
  assert.equal(radiusAt([3], 0.2), 3);
  const list = [4, 2, 0];
  assert.deepEqual([radiusAt(list, 0), radiusAt(list, 0.5), radiusAt(list, 1)], [4, 2, 0]);
  assert.equal(radiusAt(list, 0.25), 3, 'half way between two values');
  assert.ok(radiusAt(list, 0.05) > 3.9, 'it leaves a value slowly: no kink');
  assert.deepEqual([radiusAt(list, -1), radiusAt(list, 2)], [4, 0]);
});

test('a tube may close into a ring, and any shape may ask for its mirror image; glass and gloss are finishes too', () => {
  const circle = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]];
  const [ring, line, lens] = validShapes([
    { kind: 'tube', path: circle, radius: 0.2, closed: true, mirror: true, at: [6, 0, 0] },
    { kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 0.2, closed: true, mirror: 'yes' },
    { kind: 'lathe', profile: [[0, 0], [3, 0]], finish: 'glass' },
  ]);
  assert.deepEqual([ring.closed, ring.mirror], [true, true]);
  assert.deepEqual([line.closed, line.mirror], [false, false], 'two points make no ring; mirror is true or nothing');
  assert.equal(lens.finish, 'glass');
  assert.equal(validShapes([{ kind: 'plate', outline: [[0, 0], [1, 0], [1, 1]], finish: 'gloss' }])[0].finish, 'gloss');
});
