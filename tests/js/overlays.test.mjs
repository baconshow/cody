// The pills over the mascot step back after a while without a touch and come back with one (web/js/overlays.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from './fake-dom.mjs';
import { createOverlays, OVERLAYS } from '../../web/js/overlays.js';

test('the pills step back after four seconds without a touch, and a tap, a move or a key brings them back', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = createPage();
  const resting = () => p.document.body.classList.contains(OVERLAYS.class);
  createOverlays({ win: p.win, doc: p.document });
  assert.equal(resting(), false, 'there when the page opens');
  t.mock.timers.tick(OVERLAYS.rest - 1);
  assert.equal(resting(), false);
  t.mock.timers.tick(1);
  assert.equal(resting(), true, 'out of the way: the mascot has the screen');
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'focusin']) {
    p.win.dispatch({ type });
    assert.equal(resting(), false, `${type} brings them back`);
    t.mock.timers.tick(OVERLAYS.rest);
    assert.equal(resting(), true);
  }
  p.win.dispatch({ type: 'pointermove' });
  t.mock.timers.tick(OVERLAYS.rest - 500);
  p.win.dispatch({ type: 'pointermove' });                 // still around: the count starts over
  t.mock.timers.tick(OVERLAYS.rest - 500);
  assert.equal(resting(), false);
});

test('how long they stay is the caller\'s to say, and show() is there for whoever has news', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const p = createPage();
  const overlays = createOverlays({ win: p.win, doc: p.document, rest: 100 });
  t.mock.timers.tick(100);
  assert.equal(p.document.body.classList.contains(OVERLAYS.class), true);
  overlays.show();
  assert.equal(p.document.body.classList.contains(OVERLAYS.class), false);
});
