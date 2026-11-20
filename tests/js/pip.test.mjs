// Cody in a little window over the other apps (web/js/pip.js) and the page stepping aside while it is open
// (web/js/presence.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from './fake-dom.mjs';
import { createPip, pipSupported, isPip, pipUrl, speakerFor, PIP } from '../../web/js/pip.js';
import { createPresence } from '../../web/js/presence.js';

// a browser with the Document Picture-in-Picture API: requestWindow hands back a little window with its own page
function browser(href = 'http://127.0.0.1:7420/?lang=pt-BR#settings') {
  const asked = [];
  const windows = [];
  const win = {
    location: { href },
    documentPictureInPicture: {
      requestWindow: async (options) => {
        asked.push(options);
        const page = createPage();
        const listeners = new Map();
        const little = {
          document: page.document,
          focused: 0,
          closed: false,
          focus() { this.focused += 1; },
          addEventListener: (type, fn) => listeners.set(type, fn),
          close() { this.closed = true; listeners.get('pagehide')?.({ type: 'pagehide' }); },
        };
        page.document.title = '';
        page.document.head = page.document.createElement('head');
        page.document.documentElement = Object.assign(page.document.createElement('html'), { style: {} });
        windows.push(little);
        return little;
      },
    },
  };
  return { win, asked, windows };
}

test('the button only exists where the browser has the API, and the page inside knows it is the little one', () => {
  assert.equal(pipSupported(browser().win), true);
  assert.equal(pipSupported({}), false, 'Firefox, Safari, a phone');
  assert.equal(pipSupported(undefined), false);
  assert.equal(isPip('?pip=1&lang=en'), true);
  assert.equal(isPip('?lang=en'), false);
  assert.equal(isPip('?pip=0'), false);
});

test('the little window loads this same page with ?pip=1, keeping the language and dropping the #section', () => {
  assert.equal(pipUrl('http://127.0.0.1:7420/?lang=pt-BR#settings'), 'http://127.0.0.1:7420/?lang=pt-BR&pip=1');
  assert.equal(pipUrl('http://127.0.0.1:7420/'), 'http://127.0.0.1:7420/?pip=1');
});

test('opening asks for a small window and fills it with the face: black, the stylesheet, one iframe', async () => {
  const b = browser();
  const changes = [];
  const pip = createPip({ win: b.win, title: 'Cody', onChange: (open) => changes.push(open) });
  assert.equal(pip.active, false);
  const little = await pip.open();
  assert.deepEqual(b.asked, [{ width: PIP.width, height: PIP.height }]);
  const doc = little.document;
  assert.equal(doc.title, 'Cody');
  assert.equal(doc.documentElement.classList.contains('pip-host'), true);
  assert.equal(doc.documentElement.style.background, '#000', 'never a white flash while the stylesheet loads');
  const [sheet] = doc.head.children;
  assert.equal(sheet.tagName, 'LINK');
  assert.equal(sheet.href, 'http://127.0.0.1:7420/web/style.css');
  const [frame] = doc.body.children;
  assert.equal(frame.tagName, 'IFRAME');
  assert.equal(frame.src, 'http://127.0.0.1:7420/?lang=pt-BR&pip=1');
  assert.match(frame.allow, /microphone/, 'the wake word listens from inside the little window');
  assert.match(frame.allow, /autoplay/);
  assert.deepEqual(changes, [true]);
  assert.equal(pip.active, true);
});

test('the face inside plays its sound from the big page, which the tap on the button unlocked', async () => {
  const b = browser();
  b.win.AudioContext = function Context() {};
  const little = await createPip({ win: b.win }).open();
  assert.equal(little[PIP.speaker], b.win);
  const inside = { AudioContext: function Own() {} };
  inside.parent = little;
  assert.equal(speakerFor(inside), b.win);
  const alone = { AudioContext: function Own() {} };
  alone.parent = alone;                                    // the big page itself: its own sound
  assert.equal(speakerFor(alone), alone);
  const framed = { get parent() { throw new Error('SecurityError'); } };
  assert.equal(speakerFor(framed), framed);
});

test('a second tap brings the open window up instead of asking for another, and two quick taps make one', async () => {
  const b = browser();
  const pip = createPip({ win: b.win });
  const [first, second] = await Promise.all([pip.open(), pip.open()]);
  assert.equal(first, second);
  assert.equal(b.asked.length, 1);
  await pip.open();
  assert.equal(b.asked.length, 1);
  assert.equal(first.focused, 1);
});

test('closing the little window (its x, "back to tab" or the button here) gives Cody back to this page', async () => {
  const b = browser();
  const changes = [];
  const pip = createPip({ win: b.win, onChange: (open) => changes.push(open) });
  await pip.open();
  pip.close();
  assert.deepEqual(changes, [true, false]);
  assert.equal(pip.active, false);
  pip.close();                                              // nothing open: nothing happens
  await pip.open();
  assert.equal(b.asked.length, 2, 'it opens again afterwards');
});

test('a refused window (no gesture, or the browser said no) leaves everything as it was', async () => {
  const changes = [];
  const win = { location: { href: 'http://127.0.0.1:7420/' },
    documentPictureInPicture: { requestWindow: async () => { throw new Error('NotAllowedError'); } } };
  const pip = createPip({ win, onChange: (open) => changes.push(open) });
  await assert.rejects(pip.open(), /NotAllowedError/);
  assert.deepEqual(changes, []);
  assert.equal(pip.active, false);
});

// a document that can be hidden and shown, telling its listeners
function fakeDocument() {
  const listeners = [];
  return {
    hidden: false,
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.push(fn); },
    setHidden(on) { this.hidden = on; for (const fn of listeners) fn(); },
  };
}

test('the page is hidden while its tab is hidden or while Cody is in the little window, and says so when it changes', () => {
  const doc = fakeDocument();
  const presence = createPresence(doc);
  const seen = [];
  presence.watch(() => seen.push(presence.hidden()));
  assert.deepEqual(seen, [false], 'told right away');
  doc.setHidden(true);
  doc.setHidden(false);
  presence.setAway(true);
  assert.equal(presence.away, true);
  presence.setAway(true);                                    // no change: no call
  doc.setHidden(true);
  doc.setHidden(false);                                      // shown again, but Cody is still in the little window
  presence.setAway(false);
  assert.deepEqual(seen, [false, true, false, true, true, true, false]);
});

test('a watcher that stops watching hears nothing more', () => {
  const presence = createPresence(fakeDocument());
  let calls = 0;
  const stop = presence.watch(() => { calls += 1; });
  stop();
  presence.setAway(true);
  assert.equal(calls, 1);
});
