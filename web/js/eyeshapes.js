// eyeshapes.js — the eyes a scene can give the mascot instead of its two black bars: ♥ ♥ in love, ● × dizzy, > <
// laughing, ! < a wink, ★ ★ starstruck. Each shape is a glyph of half-voxel cells (like the ∩ of the happy eye in
// eyes2d.js), drawn for the LEFT eye; the right eye gets the mirror image, so "chevron" is > on the left and < on
// the right. A scene says "eyes": "heart" (both) or "eyes": ["dot", "cross"] (left, right); face2d.js stamps the
// glyph, mascot3d.js builds it from black plastic. Pure data and logic, run in Node by the tests.
//
//   EYE_SHAPES                 name → rows ('#' a cell, '.' nothing)
//   eyeRows(name, side) → rows | null     side 0: the left eye; 1: the right eye, mirrored
//   eyesOf(value) → [left, right] | null  a scene's "eyes" field, checked
//   eyeRuns(rows) → [{ col, row, len }]   the horizontal runs of cells, for building the glyph from boxes

export const EYE_SHAPES = Object.freeze({
  dot: Object.freeze([
    '..####..',
    '.######.',
    '########',
    '########',
    '.######.',
    '..####..',
  ]),
  cross: Object.freeze([
    '##....##',
    '###..###',
    '.######.',
    '..####..',
    '.######.',
    '###..###',
    '##....##',
  ]),
  chevron: Object.freeze([                 // > on the left eye, < on the right: squeezed shut, laughing
    '##....',
    '.##...',
    '..##..',
    '...##.',
    '....##',
    '...##.',
    '..##..',
    '.##...',
    '##....',
  ]),
  heart: Object.freeze([
    '.##..##.',
    '########',
    '########',
    '.######.',
    '..####..',
    '...##...',
  ]),
  bang: Object.freeze([                    // the ! of a wink
    '####',
    '####',
    '####',
    '####',
    '####',
    '####',
    '....',
    '####',
    '####',
  ]),
  star: Object.freeze([
    '....#....',
    '....#....',
    '...###...',
    '#########',
    '.#######.',
    '..#####..',
    '.##...##.',
    '.#.....#.',
  ]),
});

export const EYE_SHAPE_NAMES = Object.freeze(Object.keys(EYE_SHAPES));

export function eyeRows(name, side = 0) {
  const rows = EYE_SHAPES[name];
  if (!rows) return null;
  return side ? rows.map((r) => [...r].reverse().join('')) : rows;
}

export function eyesOf(value) {
  const pair = typeof value === 'string' ? [value, value] : value;
  if (!Array.isArray(pair) || pair.length !== 2) return null;
  return pair.every((n) => typeof n === 'string' && EYE_SHAPES[n]) ? [pair[0], pair[1]] : null;
}

export function eyeRuns(rows) {
  const runs = [];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      let end = c;
      while (end + 1 < row.length && row[end + 1] === '#') end++;
      runs.push({ col: c, row: r, len: end - c + 1 });
      c = end;
    }
  });
  return runs;
}
