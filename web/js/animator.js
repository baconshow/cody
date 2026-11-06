// animator.js — what keeps the face alive: turns the requested mood and the pointer into spring motion.
// Ported from the FaceAnimator of the open-source Bluey app (bluey-by-riley, public domain): the gaze that makes
// little jumps and never sits still, the blink (sometimes double; slow and heavy when sleepy), breathing, the pupil,
// the brows, the blush, the cheek squint, the head tilt, the idle hop and the talking mouth. Added on top of the
// port, for the mascot: the two arms and the sprout, which sways with a lag.
//
//   createAnimator({ random, quiet, mood }) → animator
//     random()   0 to 1 (Math.random; in tests, a seeded random so everything repeats)
//     quiet      "reduce motion": the springs go straight to the target; no blink, hop, breathing or jitter
//   animator.step(now) → pose (the same object, rewritten on every step)    now: seconds
//   animator.setMood(name) · lookAt(x, y, now) · releaseLook() · poke(side) · setQuiet(on)
//   animator.setListening(on)   listening sideways: turns the body and offers an ear (quiet speech, "didn't catch that")
//   animator.setProp(name)      the prop in hand ('magnifier', 'keyboard' or null): the hold spring goes 0 to 1 (in hand)
//   animator.setGrab(on)        the phone shaking: it clings to the screen edges (the grab spring, 0 to 1); when the
//                               shaking stops, it curses (q.curse runs 0 to 1 for TIMINGS.curse seconds, then is 0)
//   animator.curse()            the cursing alone (the end of a shake; ?curse=1 shows it)
//   animator.hearVoice(fn)      fn() → volume of the phrase playing (0 to 1) or null; the mouth follows it
//
// The body turns (q.yaw, radians) with the gaze and, listening sideways, with q.turn. The feet (q.feet) stay planted
// while only the head moves and walk around with a real turn: feetYaw(). While they walk, q.stepping (0 to 1) lifts
// the legs in turn.
//
// The gaze runs from −1 to 1 on both axes, with y pointing down, as in the original.

import { createSpring, stepSpring, settleSpring } from './spring.js';
import { EXPRESSION, ARMS, SLEEPING, validMood } from './moods.js';

// [stiffness, damping]: the FaceAnimator's values; arms and sprout belong to the mascot
export const SPRINGS = Object.freeze({
  look: [260, 0.82], pupil: [160, 0.5], browRaise: [180, 0.55], browTilt: [150, 0.6],
  tilt: [60, 0.8], hop: [260, 0.35], blush: [40, 1], squint: [150, 0.7],
  arm: [120, 0.55], sprout: [90, 0.3],
  recoil: [200, 0.45], turn: [70, 0.8],    // from the 3D mascot: the little hop back on a touch and turning sideways
  hold: [90, 0.75],                        // the prop coming into the hand (and going away)
  grab: [160, 0.5],                        // the startle of a shaking phone: stretch, spread and tremble
  feet: [140, 0.9],                        // the legs walking around after the body, a little late
});

export const TIMINGS = Object.freeze({
  dtMax: 1 / 20,               // a browser hiccup doesn't turn into a jolt
  live: 2.5,                   // the pointer owns the gaze until 2.5 s after it stops (the original's "live")
  saccade: [0.6, 2.2],         // the idle gaze moves to a new point
  jitter: [0.5, 1.4],          // and trembles a tiny bit, so it never looks dead
  hop: [7, 14], firstHop: 6,
  blink: [2, 5], sleepyBlink: [1.6, 3], firstBlink: 2,
  close: 0.15, sleepyClose: 0.7, double: 0.25,
  curse: 1.8,                  // the &#$*%@! in the mouth after a shake
});

export const IMPULSE = Object.freeze({ moodChange: 260, pupil: 3, hop: [180, 320], poke: 300, recoil: 9 });
const TURN_TO_LISTEN = 0.95;   // radians: sideways, with the ear-arm toward the front
// gaze: how far the body turns with the gaze (radians per unit); plant: up to this much of it, the feet stay where
// they are; stride: the feet turning this fast (radians per second) is a full step
export const TURN = Object.freeze({ gaze: 0.32, plant: 0.2, stride: 1.5 });
const PROPS = new Set(['magnifier', 'keyboard']);
const LOOK_AT_MAGNIFIER = Object.freeze({ x: 0.08, y: -0.05 });   // through the lens, at whoever is watching
const LOOK_AT_KEYBOARD = Object.freeze({ x: 0, y: 0.6 });         // down, at the keys
const LOOK_STARTLED = Object.freeze({ x: 0, y: -0.1 });           // clinging: eyes wide, straight ahead
const WANDER = Object.freeze({ x: [-0.9, 0.9], y: [-0.9, 0.4] });
const LOOK_QUIET = Object.freeze({ x: 0, y: -0.2 });
const LOOK_ASLEEP = Object.freeze({ x: 0, y: 0.25 });   // the head a tiny bit low, facing forward
const HEAD_TILT = 0.045;       // radians per unit of gaze
const VOICE_SILENT = 0.05;     // below this the phrase is in a pause (with "reduce motion", the mouth closes)

const clamp = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));

// where the feet point (radians): a real turn (listening sideways) takes them all the way; the head following the
// gaze leaves them planted, and only what goes past TURN.plant drags them along
export function feetYaw(turn, gaze) {
  const head = gaze * TURN.gaze;
  return turn + Math.sign(head) * Math.max(0, Math.abs(head) - TURN.plant);
}

function createSprings() {
  const s = (value, [stiffness, damping]) => createSpring(value, stiffness, damping);
  return {
    lookX: s(0, SPRINGS.look), lookY: s(0, SPRINGS.look), pupil: s(1, SPRINGS.pupil),
    browRaise: s(0, SPRINGS.browRaise), browTilt: s(0, SPRINGS.browTilt),
    tilt: s(0, SPRINGS.tilt), hop: s(0, SPRINGS.hop), blush: s(0.25, SPRINGS.blush), squint: s(0, SPRINGS.squint),
    raiseL: s(0, SPRINGS.arm), raiseR: s(0, SPRINGS.arm), stretchL: s(0, SPRINGS.arm), stretchR: s(0, SPRINGS.arm),
    sproutX: s(0, SPRINGS.sprout), sproutY: s(0, SPRINGS.sprout),
    recoil: s(0, SPRINGS.recoil), turn: s(0, SPRINGS.turn), hold: s(0, SPRINGS.hold), grab: s(0, SPRINGS.grab),
    feet: s(0, SPRINGS.feet),
  };
}

export function createAnimator({ random = Math.random, quiet = false, mood = 'listening' } = {}) {
  const between = (a, b) => a + (b - a) * random();
  const m = createSprings();
  const st = {
    mood: 'listening', requested: validMood(mood) ?? 'listening', changedAt: 0, quiet,
    last: null, blinkedAt: -Infinity, double: false, nextBlink: 0, nextSaccade: 0, nextHop: 0,
    wander: { x: 0, y: -0.3 }, jitter: { x: 0, y: 0 }, nextJitter: 0, talk: 0, side: 1, pointer: null, voice: null,
    listening: false, touch: 0, prop: null, lastProp: null, grab: false, cursedAt: null, cursing: false,
  };
  const q = {};
  const step = (now) => advance({ m, st, q, between, random }, now);
  return {
    step,
    get mood() { return st.mood; },
    setMood(name) { st.requested = validMood(name) ?? st.requested; },
    lookAt(x, y, now) { st.pointer = { x: clamp(x), y: clamp(y), at: now }; },
    releaseLook() { st.pointer = null; },
    // a touch: the startled little hop, a blink and the recoil backward, tipping away from the touched side
    // (side from -1, left of the face, to 1, right)
    poke(side = 0) {
      if (st.quiet) return;
      m.hop.velocity += IMPULSE.poke;
      m.recoil.velocity += IMPULSE.recoil;
      st.touch = clamp(Number(side) || 0);
      st.blinkedAt = st.last ?? 0;
    },
    setListening(on) { st.listening = !!on; },
    setGrab(on) {
      const next = !!on && !st.quiet;
      if (st.grab && !next) st.cursing = true;         // the shaking stopped: now it swears about it
      st.grab = next;
    },
    curse() { if (!st.quiet) st.cursing = true; },
    setProp(name) {
      st.prop = PROPS.has(name) ? name : null;
      if (st.prop) st.lastProp = st.prop;             // while leaving, it is still this one that fades out
    },
    setQuiet(on) { st.quiet = !!on; },
    // fn() → the volume of the phrase playing, 0 to 1, or null when nothing plays (no fn: the fake speech)
    hearVoice(fn) { st.voice = typeof fn === 'function' ? fn : null; },
  };
}

// the springs move toward the target; when quiet, they land on it
const drive = (st, spring, target, dt) => (st.quiet ? settleSpring(spring, target) : stepSpring(spring, target, dt));

function advance(ctx, now) {
  const { m, st, q } = ctx;
  if (st.last === null) startClocks(st, now);
  const dt = Math.min(Math.max(0, now - st.last), TIMINGS.dtMax);
  st.last = now;
  changeMood(st, m, now);
  look(ctx, now, dt);
  talk(st, now, dt);
  express(st, m, now, dt);
  idleHop(ctx, now, dt);
  moveArms(st, m, now, dt);
  drive(st, m.sproutX, -m.tilt.value / HEAD_TILT, dt);   // the sprout follows the head turn, loosely
  drive(st, m.sproutY, m.hop.value, dt);                 // and lags behind on a hop
  drive(st, m.recoil, 0, dt);
  drive(st, m.turn, st.listening ? TURN_TO_LISTEN * st.side : 0, dt);
  drive(st, m.feet, feetYaw(m.turn.value, m.lookX.value), dt);
  drive(st, m.hold, st.prop ? 1 : 0, dt);
  drive(st, m.grab, st.grab ? 1 : 0, dt);
  if (st.cursing) { st.cursedAt = now; st.cursing = false; }
  return fill(q, st, m, now, blink(ctx, now));
}

function startClocks(st, now) {
  st.last = now;
  st.changedAt = now;
  st.nextBlink = now + TIMINGS.firstBlink;
  st.nextHop = now + TIMINGS.firstHop;
  st.nextSaccade = now;
  st.nextJitter = now;
}

// every mood change gets a blink (it hides the eye swap) and, when awake, the startled little hop and the pupil jump
function changeMood(st, m, now) {
  if (st.requested === st.mood) return;
  st.mood = st.requested;
  st.changedAt = now;
  if (st.quiet) return;
  st.blinkedAt = now;
  if (!SLEEPING.has(st.mood)) {
    m.hop.velocity += IMPULSE.moodChange;
    m.pupil.velocity += IMPULSE.pupil;
  }
}

function lookTarget(ctx, now) {
  const { st, between } = ctx;
  const p = st.pointer && now - st.pointer.at < TIMINGS.live ? st.pointer : null;
  if (p && Math.abs(p.x) > 0.25) st.side = Math.sign(p.x);
  // asleep, neither the pointer nor the idle gaze: in 3D the body turns with the gaze, and with closed eyes it stays still
  if (st.mood === 'resting') return LOOK_ASLEEP;
  if (st.grab) return LOOK_STARTLED;
  if (st.prop === 'magnifier' && !p) return LOOK_AT_MAGNIFIER;
  if (st.prop === 'keyboard' && !p) return LOOK_AT_KEYBOARD;
  if (st.mood === 'thinking') return { x: 0.6 + (st.quiet ? 0 : 0.08 * Math.sin(now * 1.3)), y: -0.85 };
  if (p) return p;
  if (st.mood === 'pointing') return { x: 0.85 * st.side, y: -0.15 };
  if (st.quiet) return LOOK_QUIET;
  if (now > st.nextSaccade) {
    st.wander = { x: between(...WANDER.x), y: between(...WANDER.y) };
    st.nextSaccade = now + between(...TIMINGS.saccade);
  }
  return st.wander;
}

function look(ctx, now, dt) {
  const { m, st, between } = ctx;
  const target = lookTarget(ctx, now);
  if (st.quiet) st.jitter = { x: 0, y: 0 };
  else if (now > st.nextJitter) {
    // listening, the eyes stay on the pointer; the livelier little jumps belong to talking or thinking
    const awake = !SLEEPING.has(st.mood);
    const k = st.mood === 'resting' ? 0 : !awake ? 0.015 : st.mood === 'talking' ? 0.07 : st.mood === 'thinking' ? 0.05 : 0.02;
    st.jitter = { x: between(-k, k), y: between(-k, k) };
    st.nextJitter = now + between(...TIMINGS.jitter);
  }
  drive(st, m.lookX, target.x + st.jitter.x, dt);
  drive(st, m.lookY, target.y + st.jitter.y, dt);
}

// The mouth follows the volume of the phrase playing (the original's localTalk), in any mood. With no phrase
// playing, while talking, the original's fake speech (two sine waves). The talk smoothing is the original's: 25 per second.
function talk(st, now, dt) {
  let target = 0;
  if (st.mood === 'talking') target = st.quiet ? 0.45 : 0.5 + 0.5 * Math.sin(now * 19) * Math.sin(now * 7.3);
  const voice = st.voice ? st.voice() : null;
  if (Number.isFinite(voice)) target = st.quiet ? (voice > VOICE_SILENT ? 0.45 : 0) : clamp(voice, 0, 1);
  st.talk = st.quiet ? target : st.talk + (target - st.talk) * Math.min(1, dt * 25);
}

function express(st, m, now, dt) {
  const e = EXPRESSION[st.mood];
  let raise = e.browRaise;
  let tilt = e.browTilt;
  if (st.mood === 'talking') {
    raise = 6 + st.talk * 18;
    tilt = st.quiet ? 0 : 0.05 * Math.sin(now * 2.3);
  }
  drive(st, m.pupil, e.pupil, dt);
  drive(st, m.browRaise, raise, dt);
  drive(st, m.browTilt, tilt, dt);
  drive(st, m.blush, e.blush, dt);
  drive(st, m.squint, e.squint, dt);
  drive(st, m.tilt, -m.lookX.value * HEAD_TILT, dt);
}

// every now and then, with nothing going on, a happy little hop
function idleHop({ m, st, between }, now, dt) {
  if (!st.quiet && now > st.nextHop) {
    if (st.talk < 0.05 && !SLEEPING.has(st.mood)) m.hop.velocity += between(...IMPULSE.hop);
    st.nextHop = now + between(...TIMINGS.hop);
  }
  drive(st, m.hop, 0, dt);
}

function moveArms(st, m, now, dt) {
  const a = ARMS[st.mood];
  let gesture = 0;
  if (st.mood === 'talking' && !st.quiet) gesture = 0.35 * st.talk * Math.sin(now * 4.1);
  const points = (side) => (st.side === side ? a.stretch : 0);
  const loose = (side, raise) => (a.stretch > 0 && st.side !== side ? 0 : raise);
  drive(st, m.raiseL, loose(-1, a.raiseL) + Math.max(0, gesture), dt);
  drive(st, m.raiseR, loose(1, a.raiseR) + Math.max(0, -gesture), dt);
  drive(st, m.stretchL, points(-1), dt);
  drive(st, m.stretchR, points(1), dt);
}

// blinks, sometimes double; when sleepy, slow and heavy
function blink({ st, between, random }, now) {
  if (st.quiet) return 0;
  const sleepy = st.mood === 'sleepy';
  if (now > st.nextBlink) {
    st.blinkedAt = now;
    st.double = !sleepy && random() < TIMINGS.double;
    st.nextBlink = now + between(...(sleepy ? TIMINGS.sleepyBlink : TIMINGS.blink));
  }
  const p = (now - st.blinkedAt) / (sleepy ? TIMINGS.sleepyClose : TIMINGS.close);
  if (p >= 0 && p <= 1) return Math.sin(Math.PI * p);
  if (st.double && p >= 1.3 && p <= 2.3) return Math.sin(Math.PI * (p - 1.3));
  return 0;
}

function fill(q, st, m, now, closed) {
  q.time = now;
  q.mood = st.mood;
  q.sinceMood = now - st.changedAt;
  q.quiet = st.quiet;
  q.lookX = m.lookX.value;
  q.lookY = m.lookY.value;
  q.talk = st.talk;
  q.closed = closed;
  q.breath = st.quiet ? 0 : Math.sin(now * (st.mood === 'resting' ? 1.1 : 1.8));
  q.pupil = m.pupil.value;
  q.browRaise = m.browRaise.value;
  q.browTilt = m.browTilt.value;
  q.tilt = m.tilt.value;
  q.hop = m.hop.value;
  q.blush = m.blush.value;
  q.squint = clamp(m.squint.value, 0, 1);
  q.raiseL = m.raiseL.value;
  q.raiseR = m.raiseR.value;
  q.stretchL = m.stretchL.value;
  q.stretchR = m.stretchR.value;
  q.side = st.side;
  q.sproutX = m.sproutX.value;
  q.sproutY = m.sproutY.value;
  q.recoil = m.recoil.value;
  q.touch = st.touch;
  q.turn = m.turn.value;
  q.yaw = m.lookX.value * TURN.gaze + m.turn.value;
  q.feet = m.feet.value;
  q.stepping = st.quiet ? 0 : clamp(Math.abs(m.feet.velocity) / TURN.stride, 0, 1);
  q.hold = clamp(m.hold.value, 0, 1.2);
  q.prop = q.hold > 0.02 ? st.lastProp : null;
  q.grab = clamp(m.grab.value, 0, 1.3);
  const cursed = st.cursedAt === null ? 1 : (now - st.cursedAt) / TIMINGS.curse;
  q.curse = cursed > 0 && cursed < 1 && !st.quiet ? cursed : 0;
  return q;
}
