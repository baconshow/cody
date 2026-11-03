// pixel.js — the face's pixel art brush: hard-edged rectangle, grid glyph and color mix.
// Every edge lands on a whole device pixel (no antialiasing, no half tones); the position can move one pixel at a
// time, so the spring motion stays smooth without losing the hard pixel edge.
//
//   rect(ctx, x0, y0, x1, y1, color)      corners in device px; each edge is rounded on its own
//   glyph(ctx, rows, x, y, step, color)   rows of text, '#' paints; (x, y) is the top corner; step in whole px
//   mix(a, b, k) → '#rrggbb'              from a (k = 0) to b (k = 1)
//   ramp(a, b, steps) → [colors]          the mix precomputed in steps + 1 tones (nothing is built per frame)

export function rect(ctx, x0, y0, x1, y1, color) {
  const a = Math.round(Math.min(x0, x1));
  const b = Math.round(Math.min(y0, y1));
  const c = Math.round(Math.max(x0, x1));
  const d = Math.round(Math.max(y0, y1));
  if (c <= a || d <= b) return;
  ctx.fillStyle = color;
  ctx.fillRect(a, b, c - a, d - b);
}

// each run of '#' in a row becomes a single rectangle
export function glyph(ctx, rows, x, y, step, color) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      let end = c;
      while (end < row.length && row[end] === '#') end++;
      ctx.fillRect(x0 + c * step, y0 + r * step, (end - c) * step, step);
      c = end;
    }
  }
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function mix(a, b, k) {
  const [ca, cb] = [channels(a), channels(b)];
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

export function ramp(a, b, steps) {
  return Object.freeze(Array.from({ length: steps + 1 }, (_, i) => mix(a, b, i / steps)));
}
