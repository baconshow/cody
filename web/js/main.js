// main.js — the mascot page (web/index.html): the mascot's face, alive, on a canvas that fills the screen.
//
// URL options:
//   ?mood=<name>     pins one of the seven moods (moods.js)
//   ?gallery=1       the seven moods in a grid, for review; they all look at the pointer
//   no option        the cycle (cycle.js): Claude's activity, when the page has the token; otherwise, or while Claude
//                    is idle, the pointer: the face listens and follows it with its eyes; left alone, it thinks,
//                    dozes off and sleeps
//   ?seed=<n>        repeats the random draws · ?quiet=1 pretends the system asks for reduced motion
//   ?cycle=fast      runs the idle cycle in 1/6 of the time
//   ?lang=en|pt-BR   the language of the texts (i18n.js)
//   ?visual=2d       the flat 2D drawing, for comparison · ?side=1 listening sideways (the soft-speech pose)
//   ?prop=magnifier|keyboard   holding a prop (Claude searching or writing code) · ?grab=1 the startle
//   ?curse=1   the swearing at the end of a shake, again and again
//   ?sensor=1        shows what the accelerometer measures in a corner (to tune the shake on a phone)
//
// Served at / (with the token) the face reads Claude's state and activity (signal.js), only while the page is
// visible, and looks at the computer's mouse (cursor.js, like the Bluey app); holding the face talks to Claude
// (voice.js, the mascot's voice channel). Timers set by voice count down in the corner and ring (timers.js), and
// the Claude Code hooks tell the face when a long task finished or Claude needs you (alerts.js). Opened as
// /web/index.html it fetches nothing.
// On a phone the screen stays on (awake.js). With "reduce motion", the face is only redrawn when something changes.
//
// The face is the 3D mascot (scene3d.js, three.js through the page's importmap), alone and in the gallery (one
// canvas per mood); if three.js does not load (offline), or with ?visual=2d, the 2D drawing stays (face2d.js).

import { t, translate, locale, language, setLanguage } from './i18n.js';
import { api } from './api.js';
import { createAnimator, TIMINGS } from './animator.js';
import { createCycle } from './cycle.js';
import { createSignal } from './signal.js';
import { keepAwake } from './awake.js';
import { createCursor } from './cursor.js';
import { createVoice } from './voice.js';
import { createTimers } from './timers.js';
import { createTimerPanel } from './timer-panel.js';
import { createAlerts } from './alerts.js';
import { createStatus } from './status.js';
import { createSettings } from './settings.js';
import { createNetwork } from './network.js';
import { validScenes, pickScene, createSceneSounds } from './scenes.js';
import { createShake, shakeForce, SHAKE } from './shake.js';
import { measures, drawFace, createGeometry } from './face2d.js';
import { MOODS, validMood } from './moods.js';
import { seededRandom } from './seeded-random.js';
import { BODY, EYE } from './measures.js';

const LOOK_REACH = 0.45;              // fraction of the longer screen side: beyond it, the eye is already in the corner
const MAX_DPR = 3;
const QUIET_CLOCK_MS = 1000;          // when still, the idle cycle still checks the mood once a second
const CURSOR_LOOK_Y = 0.8;            // the computer screen is wider than tall: the gaze moves less up and down
const POINTING_S = 6;                 // the face points along while the mini Cody points on the computer screen
const NEEDS_YOU_S = 8;                // and points at the computer when Claude is waiting for you

// Cody's sounds for things that happen to the face (a shake, a scene coming in): set once the voice exists. A tap is
// not one of them: tapping (and holding) the face is how you call Cody, so it answers with a hop, never with a sound
const reactions = { play: () => {} };   // name → sound; an unknown or empty name plays nothing
const sceneSound = createSceneSounds();
const VOICE_NOTICE_MS = 9000;
const WAKE_TOLD_MS = 1800;            // how long the wake word light spells out its state after a switch

function readOptions(search) {
  const q = new URLSearchParams(search);
  const seed = Number.parseInt(q.get('seed'), 10);
  return {
    mood: validMood(q.get('mood')),
    gallery: q.get('gallery') === '1',
    quiet: q.get('quiet') === '1',
    fast: q.get('cycle') === 'fast',
    visual: q.get('visual') === '2d' ? '2d' : '3d',
    side: q.get('side') === '1',
    prop: ['magnifier', 'keyboard'].includes(q.get('prop')) ? q.get('prop') : null,
    grab: q.get('grab') === '1',
    curse: q.get('curse') === '1',
    scene: q.get('scene'),
    sensor: q.get('sensor') === '1',
    seed: Number.isFinite(seed) ? seed : Math.floor(Math.random() * 2 ** 31),
  };
}

function createFace(parent, {
  mood, seed, quiet, caption, scene3d, side = false, prop = null, grab = false, curse = false,
}) {
  const figure = document.createElement('figure');
  figure.className = 'face';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  figure.append(canvas);
  if (caption) {
    const text = document.createElement('figcaption');
    text.dataset.t = `mascot.mood.${mood}`;
    text.textContent = t(text.dataset.t);
    figure.append(text);
  }
  parent.append(figure);
  const scene = scene3d ? scene3d(canvas) : null;
  const animator = createAnimator({ random: seededRandom(seed), quiet, mood: mood ?? 'listening' });
  if (side) animator.setListening(true);
  if (prop) animator.setProp(prop);
  if (grab) animator.setGrab(true);
  if (curse) setInterval(() => animator.curse(), 2500);    // developer option: swears again and again
  return {
    canvas, ctx: scene ? null : canvas.getContext('2d', { alpha: false }), scene, animator, fixed: mood,
    size: null, dpr: 1, geo: createGeometry(), said: null,
  };
}

function mount(root, op, quiet, scene3d) {
  if (!op.gallery) {
    root.classList.add('full');
    return [createFace(root, { mood: op.mood, seed: op.seed, quiet, scene3d, side: op.side, prop: op.prop, grab: op.grab,
      curse: op.curse })];
  }
  document.body.classList.add('with-gallery');
  const title = document.createElement('h1');
  title.dataset.t = 'mascot.gallery';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.dataset.t = 'mascot.galleryHint';
  const grid = document.createElement('div');
  grid.className = 'grid';
  root.append(title, grid, hint);
  return MOODS.map((mood, i) => createFace(grid, { mood, seed: op.seed + i, quiet, caption: true, scene3d }));
}

// the canvas at the size of its box, in device pixels (hard edges on high-density screens too)
function measureFace(f) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const box = f.canvas.getBoundingClientRect();
  f.dpr = dpr;
  if (f.scene) {
    f.size = { mode: f.scene.measure(Math.max(1, box.width), Math.max(1, box.height), dpr) };
    return;
  }
  const width = Math.max(1, Math.round(box.width * dpr));
  const height = Math.max(1, Math.round(box.height * dpr));
  if (f.canvas.width !== width) f.canvas.width = width;
  if (f.canvas.height !== height) f.canvas.height = height;
  f.dpr = dpr;
  f.size = measures(width, height);
}

function announceMood(f, mood) {
  if (f.said === mood) return;
  f.said = mood;
  f.canvas.setAttribute('aria-label', t('mascot.face', { mood: t(`mascot.mood.${mood}`) }));
}

function paint(f, q) {
  if (f.scene) {
    if (f.scene.draw(q) && q.scene) reactions.play(sceneSound(scenes.list.find((s) => s.id === q.scene), q.time));
  } else drawFace(f.ctx, q, f.size, f.geo);
  announceMood(f, q.mood);
}

// the scenes (scenes.js, web/scenes/scenes.json): loaded once; ?scene=<id> shows one all the time
const scenes = { list: [], forced: null };

function drawOne(f, now, cycle) {
  if (!f.size) return;
  if (cycle && !f.fixed) {
    f.animator.setMood(cycle.mood(now));
    f.animator.setProp(cycle.prop());
  }
  const q = f.animator.step(now);
  if (f.scenes) q.scene = scenes.forced || (cycle ? pickScene(scenes.list, cycle.situation(now))?.id : null) || null;
  paint(f, q);
}

async function loadScenes(face, forced) {
  try {
    const resp = await fetch('/web/scenes/scenes.json', { cache: 'no-cache' });
    scenes.list = validScenes(await resp.json());
  } catch { scenes.list = []; }
  scenes.forced = scenes.list.some((s) => s.id === forced) ? forced : null;
  if (face?.scene?.setScenes && scenes.list.length) {
    face.scene.setScenes(scenes.list);
    face.scenes = true;
  }
}

// every frame while there is movement; when quiet, only when something asks for it
function createLoop(faces, cycle, state) {
  let pending = 0;
  const request = () => { if (!pending) pending = requestAnimationFrame(frame); };
  function frame(ms) {
    pending = 0;
    for (const f of faces) drawOne(f, ms / 1000, cycle);
    if (!state.quiet) request();
  }
  return { request };
}

// each face's gaze points from the middle of its eyes to the pointer
function aim(faces, x, y, now) {
  const reach = Math.max(window.innerWidth, window.innerHeight) * LOOK_REACH;
  for (const f of faces) {
    if (!f.size) continue;
    const box = f.canvas.getBoundingClientRect();
    const eyes = f.scene?.eyeCenter();
    const ex = box.left + (eyes ? eyes.x : (f.size.ox + f.size.u * (BODY.width / 2)) / f.dpr);
    const ey = box.top + (eyes ? eyes.y : (f.size.oy + f.size.u * (EYE.top + EYE.height / 2)) / f.dpr);
    f.animator.lookAt((x - ex) / reach, (y - ey) / reach, now);
  }
}

// which side of the face was touched: -1 on the left, 1 on the right (the recoil tips to the other side)
function touchSide(f, x) {
  const box = f.canvas.getBoundingClientRect();
  const eyes = f.scene?.eyeCenter();
  const middle = box.left + (eyes ? eyes.x : box.width / 2);
  return Math.max(-1, Math.min(1, (x - middle) / Math.max(1, box.width / 3)));
}

// the mascot itself (its canvas), not something drawn over it: the lights in the corners, a panel, a field
const onFace = (target) => target instanceof Element && !!target.closest('.face');

// local.at: when the pointer (or finger) on this page last moved; until TIMINGS.live later, it drives the gaze
function wirePointer(faces, cycle, request, local) {
  const now = () => performance.now() / 1000;
  const poke = (x = null) => {
    for (const f of faces) f.animator.poke(x === null ? 0 : touchSide(f, x));
    cycle?.touched(now());
    request();
  };
  window.addEventListener('pointermove', (e) => {
    local.at = now();
    aim(faces, e.clientX, e.clientY, now());
    cycle?.moved(now());
    request();
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    local.at = now();
    aim(faces, e.clientX, e.clientY, now());
    if (onFace(e.target)) poke(e.clientX);               // a button or a panel over the mascot is not a pat
  });
  window.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    for (const f of faces) f.animator.releaseLook();     // finger off the screen: the gaze wanders again
    request();
  });
  window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body) poke();   // not while typing in a field
  });
}

// Claude's activity, read only while the page is visible (a phone in a pocket does not keep asking)
function startSignal() {
  const signal = createSignal({ api });
  const sync = () => (document.hidden ? signal.stop() : signal.start());
  document.addEventListener('visibilitychange', sync);
  sync();
  return signal;
}

// the computer's mouse (cursor.js): the face looks where it is on the screen, like the Bluey app; a finger on the
// phone's screen takes over. When the mini Cody points at something there, the face looks and points too
function wireCursor(faces, cycle, request, local) {
  const cursor = createCursor({
    api,
    onMove: ({ x, y, pointing }) => {
      const now = performance.now() / 1000;
      if (pointing) cycle?.alert('pointing', POINTING_S, now);
      if (now - local.at < TIMINGS.live) return;
      for (const f of faces) f.animator.lookAt(x, y * CURSOR_LOOK_Y, now);
      request();
    },
  });
  const sync = () => (document.hidden ? cursor.stop() : cursor.start());
  document.addEventListener('visibilitychange', sync);
  sync();
}

// voice commands (voice.js): hold the face or call "Cody". The caption at the top, the box with the link or
// command at the bottom (a tap copies it and, for a link, opens it), the light in the corner that turns the wake word
// on and off (green: listening for "Cody"; red: off; the words show on hover and for a moment after a switch), and
// the mouth following the volume of the speech
function wireVoice(f, cycle, request) {
  const make = (tag, className) => Object.assign(document.createElement(tag), { className });
  const caption = make('p', 'caption');
  caption.setAttribute('aria-live', 'polite');
  const attachment = make('button', 'attachment');
  attachment.type = 'button';
  const wake = make('button', 'wake');
  wake.type = 'button';
  const notice = make('p', 'voice-notice');
  notice.setAttribute('role', 'status');
  document.body.append(caption, attachment, wake, notice);
  const shot = createShot();
  const voice = createVoice({
    api, target: f.canvas, t,
    onImage: (id) => shot.show(id),
    onState: (mood) => { cycle.setVoice(mood); request(); },
    onCaption: (text) => { if (text) caption.textContent = text; caption.classList.toggle('visible', !!text); },
    onAttachment: (text) => { if (text) attachment.textContent = text; attachment.classList.toggle('visible', !!text); },
    onSide: (on) => { f.animator.setListening(on); request(); },
    onNotice: (text) => {
      notice.textContent = text;
      notice.classList.add('visible');
      clearTimeout(notice.timer);
      notice.timer = setTimeout(() => notice.classList.remove('visible'), VOICE_NOTICE_MS);
    },
    onListening: (on) => {
      const say = t(on ? 'mascot.voice.wakeWord' : 'mascot.voice.wakeWordOff');
      wake.setAttribute('aria-pressed', String(on));
      wake.setAttribute('aria-label', say);
      wake.dataset.tip = say;
      remember(PREF_WAKE_WORD, on);
    },
  });
  f.animator.hearVoice(() => voice.volume());
  attachment.addEventListener('click', () => useAttachment(attachment.textContent));
  wake.addEventListener('click', () => {
    voice.listen(!voice.listening);
    wake.classList.add('told');                          // a phone has no hover: say what changed, briefly
    clearTimeout(wake.timer);
    wake.timer = setTimeout(() => wake.classList.remove('told'), WAKE_TOLD_MS);
  });
  voice.listen(remembered(PREF_WAKE_WORD, true));
  const sync = () => (document.hidden ? voice.stop() : voice.start());
  document.addEventListener('visibilitychange', sync);
  sync();
  return voice;
}

// timers set by voice (timers.js): the panel in the corner; when one ends the face hops, the phone buzzes, the
// mascot says what it was for and chimes until a tap on the panel (or a minute). They keep counting while the page
// is hidden, so a reminder still rings when the screen comes back
function wireTimers(voice, cycle, request) {
  const timers = createTimers({
    api,
    onChange: (rows) => panel.render(rows),
    onRing: (timer) => {
      cycle.cheer(performance.now() / 1000);
      request();
      navigator.vibrate?.([200, 100, 200]);
      voice.play('alarm');
      voice.announce({ text: timer.say, alert: `timer:${timer.id}` });
    },
    onChime: () => voice.chime(),
  });
  const panel = createTimerPanel({ t, locale, onDismiss: () => timers.dismiss() });
  timers.start();
}

// heads-up from the Claude Code hooks (alerts.js): a long task done, a hop and "done!"; Claude waiting for
// permission, the face points at the computer and calls you
function wireAlerts(voice, cycle, request) {
  const alerts = createAlerts({
    api,
    onAlert: (e) => {
      const now = performance.now() / 1000;
      if (e.kind === 'done') cycle.cheer(now);
      else cycle.alert('pointing', NEEDS_YOU_S, now);
      request();
      voice.play(e.kind === 'done' ? 'done' : 'calling');
      voice.announce({ text: e.say, alert: e.kind });
    },
  });
  const sync = () => (document.hidden ? alerts.stop() : alerts.start());
  document.addEventListener('visibilitychange', sync);
  sync();
}

// a screenshot Claude took because it was asked ("take a screenshot and send it to my WhatsApp"): the picture over the
// face, with Share (the phone's share sheet, where WhatsApp and the rest live), Save and Close. Sharing needs a tap:
// the browser only opens the share sheet from a user gesture, so the last step is always yours.
function createShot() {
  const make = (tag, className, key) => {
    const e = Object.assign(document.createElement(tag), { className });
    if (key) { e.type = 'button'; e.textContent = t(key); }
    return e;
  };
  const panel = make('figure', 'shot');
  const img = make('img', 'shot-image');
  img.alt = t('mascot.shot.alt');
  const share = make('button', 'shot-button', 'mascot.shot.share');
  const save = make('button', 'shot-button', 'mascot.shot.save');
  const close = make('button', 'shot-button', 'mascot.shot.close');
  const bar = make('div', 'shot-bar');
  bar.append(share, save, close);
  panel.append(img, bar);
  document.body.append(panel);
  const st = { file: null, url: null };

  function hide() {
    panel.classList.remove('visible');
    if (st.url) URL.revokeObjectURL(st.url);
    st.file = st.url = null;
  }
  async function show(id) {
    try {
      const bytes = await api.voiceImage(id);
      hide();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      st.file = new File([bytes], `screenshot-${stamp}.png`, { type: 'image/png' });
      st.url = URL.createObjectURL(st.file);
      img.src = st.url;
      share.hidden = !navigator.canShare?.({ files: [st.file] });
      panel.classList.add('visible');
    } catch (e) {
      console.warn('[cody]', t('mascot.shot.failed'), e);
    }
  }
  share.addEventListener('click', () => {
    if (st.file) navigator.share({ files: [st.file] }).catch(() => { /* closed the share sheet */ });
  });
  save.addEventListener('click', () => {
    if (!st.url) return;
    const link = Object.assign(document.createElement('a'), { href: st.url, download: st.file.name });
    link.click();
  });
  close.addEventListener('click', hide);
  return { show };
}

// the box at the bottom: copies the text; if it is a link (http or https), opens it too
function useAttachment(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
  if (/^https?:\/\/\S+$/i.test(text)) window.open(text, '_blank', 'noopener');
}

// the viewer's preferences (localStorage may be missing: private tab, blocked storage)
const PREF_WAKE_WORD = 'cody:wakeWord';
function remembered(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}
function remember(key, on) {
  try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* no storage: this visit only */ }
}

// the phone being shaken (shake.js): the mascot grabs the edges of the screen. On an iPhone the sensor only turns on
// after asking permission on a tap; without a sensor (a computer), nothing happens
function wireShake(faces, request, showSensor) {
  const panel = showSensor ? createSensorPanel() : null;
  const shake = createShake({
    onChange: (grabbing) => {
      for (const f of faces) f.animator.setGrab(grabbing);
      if (grabbing) reactions.play('startle');
      request();
      panel?.grabbed(grabbing);
    },
  });
  const Motion = window.DeviceMotionEvent;
  panel?.status(Motion ? 'sensor: waiting for the first event' : 'sensor: this browser has none');
  if (!Motion) return;
  // the listener goes on right away: on Android the events arrive without asking. Recent Chrome also has
  // requestPermission (like the iPhone), and waiting for it left the sensor off; the request goes on the first tap,
  // only where it is needed
  window.addEventListener('devicemotion', (e) => {
    const force = shakeForce(e);
    shake.measure(force);
    panel?.measure(force);
  }, { passive: true });
  if (typeof Motion.requestPermission === 'function') {
    window.addEventListener('pointerup', () => {
      Motion.requestPermission().catch(() => {});
    }, { once: true });
  }
}

// ?sensor=1: the shake diagnostics, in the bottom corner: how many events arrived, the force now and the peak of the
// last second, and whether it is grabbing (developer text, outside the catalogue)
function createSensorPanel() {
  const p = Object.assign(document.createElement('p'), { className: 'sensor' });
  document.body.append(p);
  const st = { events: 0, peak: 0, peakAt: 0, grabbing: false };
  const write = (force) => {
    p.textContent = `events ${st.events} · now ${force.toFixed(1)} · peak ${st.peak.toFixed(1)} m/s² · threshold ${SHAKE.force}` +
      (st.grabbing ? ' · GRABBING' : '');
  };
  return {
    status: (text) => { p.textContent = text; },
    measure(force) {
      st.events += 1;
      const now = performance.now();
      if (force > st.peak || now - st.peakAt > 1000) { st.peak = force; st.peakAt = now; }
      if (st.events % 6 === 0) write(force);
    },
    grabbed(on) { st.grabbing = on; write(0); },
  };
}

// the 3D mascot; without three.js (no WebGL, or the module failed to load), the 2D drawing
async function load3d() {
  try {
    return (await import('./scene3d.js')).createScene3d;
  } catch (error) {
    console.warn('[cody] the 3D scene did not load; using the 2D drawing', error?.message);
    return null;
  }
}

async function start() {
  const op = readOptions(location.search);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { quiet: op.quiet || motion.matches };
  document.title = t('mascot.title');
  const scene3d = op.visual === '2d' ? null : await load3d();
  const faces = mount(document.getElementById('mascot'), op, state.quiet, scene3d);
  translate(document);
  const fixed = op.mood || op.gallery;
  const cycle = fixed ? null : createCycle({ fast: op.fast, signal: startSignal() });
  if (!op.gallery) keepAwake();
  const loop = createLoop(faces, cycle, state);
  const observer = new ResizeObserver(() => { faces.forEach(measureFace); loop.request(); });
  faces.forEach((f) => observer.observe(f.canvas));
  motion.addEventListener('change', () => {
    state.quiet = op.quiet || motion.matches;
    faces.forEach((f) => f.animator.setQuiet(state.quiet));
    loop.request();
  });
  if (cycle) setInterval(() => { if (state.quiet) loop.request(); }, QUIET_CLOCK_MS);
  const local = { at: -Infinity };
  wirePointer(faces, cycle, loop.request, local);
  if (!op.gallery) wireCursor(faces, cycle, loop.request, local);
  if (!op.gallery) wireShake(faces, loop.request, op.sensor);
  if (cycle && api.hasToken()) {
    const voice = wireVoice(faces[0], cycle, loop.request);
    reactions.play = (name) => voice.play(name);
    wireTimers(voice, cycle, loop.request);
    wireAlerts(voice, cycle, loop.request);
    createStatus({ api, t, lang: language, audio: voice.sound, request: loop.request });
    createSettings({ api, t, setLanguage, language, announce: (m) => voice.announce(m) }).firstRun();
    createNetwork({ api, t });
  }
  if (!op.gallery) await loadScenes(faces[0], op.scene);
  faces.forEach(measureFace);
  loop.request();
}

start();
