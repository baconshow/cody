// Tests for the face's spring and animator (web/js/spring.js, animator.js): the port of Bluey's FaceAnimator, with
// a seeded random so everything repeats.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpring, stepSpring, settleSpring } from '../../web/js/spring.js';
import { knockTap } from '../../web/js/mascot3d.js';
import { createAnimator, feetYaw, SPRINGS, TIMINGS, TURN } from '../../web/js/animator.js';
import { MOODS, EXPRESSION } from '../../web/js/moods.js';
import { seededRandom } from '../../web/js/seeded-random.js';

const STEP = 1 / 60;
const near = (a, b, tolerance, msg) => assert.ok(Math.abs(a - b) <= tolerance, `${msg}: ${a} far from ${b}`);

// runs the animator from `from` to `to` seconds, in 1/60 steps; returns the poses (copies) when asked
function run(animator, from, to, keep = false) {
  const poses = [];
  let q = null;
  for (let s = from; s <= to + 1e-9; s += STEP) {
    q = animator.step(s);
    if (keep) poses.push({ ...q });
  }
  return keep ? poses : q;
}
const fresh = (mood, seed = 7, quiet = false) => createAnimator({ random: seededRandom(seed), mood, quiet });

test('the spring reaches the target; with damping 1 it does not overshoot, with 0.35 it overshoots and comes back', () => {
  const critical = createSpring(0, 200, 1);
  const loose = createSpring(0, 260, 0.35);
  let criticalOvershot = false;
  let looseOvershot = false;
  for (let i = 0; i < 240; i++) {
    stepSpring(critical, 1, STEP);
    stepSpring(loose, 1, STEP);
    criticalOvershot ||= critical.value > 1.001;
    looseOvershot ||= loose.value > 1.05;
  }
  near(critical.value, 1, 1e-3, 'critical');
  near(loose.value, 1, 1e-2, 'loose');
  assert.equal(criticalOvershot, false);
  assert.equal(looseOvershot, true);
});

test('the spring math is the FaceAnimator one: velocity first, then position', () => {
  const m = createSpring(0, 200, 0.7);
  stepSpring(m, 1, 0.05);
  const friction = 2 * Math.sqrt(200) * 0.7;
  const v = (200 * 1 - friction * 0) * 0.05;
  assert.equal(m.velocity, v);
  assert.equal(m.value, v * 0.05);
  assert.equal(settleSpring(m, 3), 3);
  assert.deepEqual([m.value, m.velocity], [3, 0]);
});

test('the ported springs keep the original stiffness and damping', () => {
  assert.deepEqual(SPRINGS.look, [260, 0.82]);
  assert.deepEqual(SPRINGS.pupil, [160, 0.5]);
  assert.deepEqual(SPRINGS.browRaise, [180, 0.55]);
  assert.deepEqual(SPRINGS.browTilt, [150, 0.6]);
  assert.deepEqual(SPRINGS.tilt, [60, 0.8]);
  assert.deepEqual(SPRINGS.hop, [260, 0.35]);
  assert.deepEqual(SPRINGS.blush, [40, 1]);
  assert.deepEqual(SPRINGS.squint, [150, 0.7]);
});

test('same seed, same poses; another seed, another wandering gaze', () => {
  const a = run(fresh('listening', 3), 0, 20, true);
  const b = run(fresh('listening', 3), 0, 20, true);
  assert.deepEqual(a, b);
  const c = run(fresh('listening', 4), 0, 20, true);
  assert.notDeepEqual(a.map((q) => q.lookX), c.map((q) => q.lookX));
});

test('a long browser hiccup only advances 1/20 s', () => {
  const an = fresh('happy');
  an.step(0);
  const after = an.step(30);
  const one = fresh('happy');
  one.step(0);
  const reference = one.step(TIMINGS.dtMax);
  assert.equal(after.squint, reference.squint);
});

test('every mood reaches the original expression targets', () => {
  for (const mood of MOODS) {
    const q = run(fresh(mood), 0, 6);
    const e = EXPRESSION[mood];
    assert.equal(q.mood, mood);
    near(q.pupil, e.pupil, 0.02, `${mood} pupil`);
    near(q.blush, e.blush, 0.02, `${mood} blush`);
    near(q.squint, e.squint, 0.02, `${mood} squint`);
    if (mood !== 'talking') near(q.browRaise, e.browRaise, 0.3, `${mood} brow`);
  }
});

test('changing mood while awake: blinks and hops; when sleepy, only blinks', () => {
  const awake = fresh('listening');
  run(awake, 0, 1);
  awake.setMood('happy');
  const after = run(awake, 1 + STEP, 1.2, true);
  assert.ok(after.some((q) => q.closed > 0.5), 'blinked');
  assert.ok(after.some((q) => q.hop > 5), 'hopped');
  const sleepy = fresh('listening');
  run(sleepy, 0, 1);
  sleepy.setMood('sleepy');
  const drowsy = run(sleepy, 1 + STEP, 1.2, true);
  assert.ok(drowsy.some((q) => q.closed > 0.1), 'blinked slowly');
  assert.ok(drowsy.every((q) => q.hop < 1), 'did not hop');
});

test('thinking, the gaze goes up and to the right; happy, the eyes turn into arcs', () => {
  const thinking = run(fresh('thinking'), 0, 3);
  near(thinking.lookY, -0.85, 0.12, 'up');
  near(thinking.lookX, 0.6, 0.15, 'to the right');
  assert.ok(run(fresh('happy'), 0, 2).squint > 0.6);
});

test('the gaze follows the pointer and wanders again 2.5 s after it stops', () => {
  const an = fresh('listening');
  run(an, 0, 1);
  an.lookAt(-0.8, 0.5, 1);
  const followed = run(an, 1 + STEP, 1.6);
  near(followed.lookX, -0.8, 0.1, 'x');
  near(followed.lookY, 0.5, 0.1, 'y');
  const released = run(an, 1.6 + STEP, 1 + TIMINGS.live + 3, true);
  assert.ok(released.some((q) => Math.abs(q.lookX + 0.8) > 0.2 || Math.abs(q.lookY - 0.5) > 0.2), 'wandered');
});

test('pointing, the arm on the gaze side stretches; the other hangs loose', () => {
  const an = fresh('pointing');
  run(an, 0, 0.5);
  an.lookAt(-0.9, 0, 0.5);
  const q = run(an, 0.5 + STEP, 2.5);
  assert.equal(q.side, -1);
  assert.ok(q.stretchL > 0.9 && q.stretchR < 0.1);
});

test('blinks every 2 to 5 s (sometimes twice); when sleepy, every 1.6 to 3 s and slowly', () => {
  const count = (mood, closeMax) => {
    const poses = run(fresh(mood, 11), 0, 60, true);
    let blinks = 0;
    let duration = 0;
    let longest = 0;
    for (let i = 1; i < poses.length; i++) {
      if (poses[i].closed > 0 && poses[i - 1].closed === 0) blinks++;
      duration = poses[i].closed > 0 ? duration + STEP : 0;
      longest = Math.max(longest, duration);
    }
    assert.ok(longest <= closeMax + 2 * STEP, `${mood}: blink of ${longest} s`);
    return blinks;
  };
  const awake = count('listening', TIMINGS.close);
  assert.ok(awake >= 60 / 5 && awake <= (60 / 2) * 2, `${awake} blinks`);
  const sleepy = count('sleepy', TIMINGS.sleepyClose);
  assert.ok(sleepy >= 60 / 3 - 1 && sleepy <= 60 / 1.6 + 1, `${sleepy} sleepy blinks`);
});

test('reduce motion: everything on target, no blinking, hopping, breathing or jitter', () => {
  const an = fresh('happy', 7, true);
  const q = an.step(0);
  assert.equal(q.squint, 1);
  assert.equal(q.pupil, EXPRESSION.happy.pupil);
  const poses = run(an, STEP, 30, true);
  assert.ok(poses.every((x) => x.closed === 0 && x.hop === 0 && x.breath === 0));
  assert.ok(poses.every((x) => x.lookX === poses[0].lookX && x.lookY === poses[0].lookY));
  an.poke();
  assert.equal(an.step(31).hop, 0);
});

test('talking: the mouth opens and closes; in the other moods it stays shut', () => {
  const talks = run(fresh('talking'), 0, 4, true).map((q) => q.talk);
  assert.ok(Math.max(...talks) > 0.7 && Math.min(...talks.slice(60)) < 0.2);
  assert.ok(run(fresh('happy'), 0, 4, true).every((q) => q.talk === 0));
});

test('with a voice playing, the mouth follows the phrase volume; in silence it closes; with no phrase, the fake speech returns', () => {
  const an = fresh('talking');
  let volume = 0.8;
  an.hearVoice(() => volume);
  near(run(an, 0, 1).talk, 0.8, 0.01, 'loud volume');
  volume = 0;
  assert.ok(run(an, 1 + STEP, 1.5).talk < 0.01, 'pause in the phrase: mouth shut');
  volume = null;
  const free = run(an, 1.5 + STEP, 4, true).map((q) => q.talk);
  assert.ok(Math.max(...free) > 0.7, 'no phrase: the original two sine waves');
  const listening = fresh('listening');
  listening.hearVoice(() => 0.6);
  near(run(listening, 0, 1).talk, 0.6, 0.01, 'the phrase drives the mouth in any mood');
  const quiet = fresh('talking', 7, true);
  quiet.hearVoice(() => 0.9);
  assert.equal(quiet.step(0).talk, 0.45, 'reduce motion: mouth half open, still');
});

test('asleep it stays still: neither the pointer nor the idle gaze moves the head', () => {
  const animator = createAnimator({ random: seededRandom(7), quiet: false, mood: 'resting' });
  let q = null;
  for (let s = 0; s <= 6; s += STEP) {
    if (s > 3) animator.lookAt(0.9, -0.8, s);
    q = animator.step(s);
  }
  near(q.lookX, 0, 0.01, 'gaze x asleep');
  near(q.lookY, 0.25, 0.01, 'gaze y asleep');
});

test('the touch: pulls back and tips away from the touched side, then returns', () => {
  const animator = createAnimator({ random: seededRandom(3), quiet: false, mood: 'listening' });
  run(animator, 0, 1);
  animator.poke(1);                                      // touched on the right of the face
  let largest = 0;
  let q = null;
  for (let s = 1; s <= 1.4; s += STEP) { q = animator.step(s); largest = Math.max(largest, q.recoil); }
  assert.ok(largest > 0.2, `recoiled ${largest}`);
  assert.equal(q.touch, 1);
  for (let s = 1.4; s <= 4; s += STEP) q = animator.step(s);
  near(q.recoil, 0, 0.02, 'back in place');
});

test('listening sideways: turns the body to offer the ear and turns back when it stops', () => {
  const animator = createAnimator({ random: seededRandom(3), quiet: false, mood: 'listening' });
  animator.setListening(true);
  let q = null;
  for (let s = 0; s <= 3; s += STEP) q = animator.step(s);
  assert.ok(Math.abs(q.turn) > 0.85, `turned ${q.turn}`);
  animator.setListening(false);
  for (let s = 3; s <= 7; s += STEP) q = animator.step(s);
  near(q.turn, 0, 0.03, 'turned back');
});

test('the feet stay planted while only the head moves and walk around with a real turn', () => {
  assert.equal(feetYaw(0, 0.5), 0, 'half a glance: planted');
  assert.equal(feetYaw(0, -TURN.plant / TURN.gaze), 0, 'up to the limit: still planted');
  near(feetYaw(0, 1), TURN.gaze - TURN.plant, 1e-9, 'past the limit, only the excess drags them');
  near(feetYaw(0, -1), -(TURN.gaze - TURN.plant), 1e-9, 'the same to the other side');
  near(feetYaw(0.95, 0), 0.95, 1e-9, 'a real turn takes them all the way');

  const animator = createAnimator({ random: seededRandom(3), quiet: false, mood: 'listening' });
  run(animator, 0, 1);
  let q = null;
  for (let s = 1; s <= 2.5; s += STEP) { animator.lookAt(1, 0, s); q = animator.step(s); }
  assert.ok(q.yaw > 0.28, `the body turned with the gaze: ${q.yaw}`);
  assert.ok(Math.abs(q.feet) < 0.15, `the feet barely moved: ${q.feet}`);
  near(q.stepping, 0, 0.02, 'standing still, no steps');

  animator.setListening(true);
  let stepped = 0;
  for (let s = 2.5; s <= 6; s += STEP) { animator.lookAt(1, 0, s); q = animator.step(s); stepped = Math.max(stepped, q.stepping); }
  assert.ok(q.yaw > 1.1, `turned sideways: ${q.yaw}`);
  assert.ok(q.yaw - q.feet < TURN.plant + 0.02, `the legs came along: body ${q.yaw}, feet ${q.feet}`);
  assert.ok(stepped > 0.5, `and stepped on the way: ${stepped}`);
  near(q.stepping, 0, 0.02, 'arrived: the steps stop');

  const calm = createAnimator({ random: seededRandom(3), quiet: true, mood: 'listening' });
  calm.setListening(true);
  q = calm.step(0);
  near(q.feet, q.turn, 1e-9, 'reduce motion: the feet are already there');
  assert.equal(q.stepping, 0);
});

test('thinking brings a front leg up (q.lift), and it comes down again when the thought is over', () => {
  const animator = fresh('listening', 3);
  let q = run(animator, 0, 1);
  near(q.lift, 0, 1e-6, 'listening: all four on the floor');
  animator.setMood('thinking');
  q = run(animator, 1, 1.1);
  assert.ok(q.lift > 0.05 && q.lift < 0.9, `on its way up, not at once: ${q.lift}`);
  q = run(animator, 1.1, 3);
  near(q.lift, 1, 0.03, 'thinking: the leg is up');
  animator.setMood('listening');
  q = run(animator, 3, 5);
  near(q.lift, 0, 0.03, 'back on the floor');

  q = fresh('thinking', 3, true).step(0);
  assert.equal(q.lift, 1, 'reduce motion: already up');
});

test('the prop in hand: the magnifier comes in (hold reaches 1) and leaves without vanishing at once', () => {
  const animator = createAnimator({ random: seededRandom(3), quiet: false, mood: 'listening' });
  animator.setProp('magnifier');
  let q = null;
  for (let s = 0; s <= 2; s += STEP) q = animator.step(s);
  near(q.hold, 1, 0.05, 'in hand');
  assert.equal(q.prop, 'magnifier');
  animator.setProp(null);
  q = animator.step(2 + STEP);
  assert.equal(q.prop, 'magnifier', 'while leaving, it is still the magnifier that fades out');
  for (let s = 2; s <= 5; s += STEP) q = animator.step(s);
  assert.equal(q.prop, null);
  animator.setProp('hammer');
  assert.equal(animator.step(5.1).prop, null, 'an unknown prop does not come in');
});

test('when the shaking stops it swears for TIMINGS.curse seconds; quiet never swears', () => {
  const a = createAnimator({ random: seededRandom(3) });
  a.step(0);
  a.setGrab(true);
  assert.equal(a.step(0.5).curse, 0, 'no swearing while it clings');
  a.setGrab(false);
  a.step(1);
  assert.ok(a.step(1 + TIMINGS.curse / 2).curse > 0.4);
  assert.equal(a.step(1 + TIMINGS.curse + 0.1).curse, 0, 'and then it is over');
  a.setGrab(false);
  assert.equal(a.step(5).curse, 0, 'no shake, no swearing');
  const calm = createAnimator({ random: seededRandom(3), quiet: true });
  calm.step(0);
  calm.curse();
  assert.equal(calm.step(0.5).curse, 0);
});

test('knocking on the screen: the knock spring rises with setKnock and falls after; the raps come in pairs', () => {
  const a = createAnimator({ random: () => 0.5 });
  a.step(0);
  assert.equal(a.step(0.5).knock, 0);
  a.setKnock(true);
  for (let t = 0.5; t < 2; t += 1 / 60) a.step(t);
  assert.ok(Math.abs(a.step(2).knock - 1) < 0.02, 'up');
  a.setKnock(false);
  for (let t = 2; t < 4; t += 1 / 60) a.step(t);
  assert.ok(a.step(4).knock < 0.02, 'down again');
  assert.equal(createAnimator({ quiet: true }).step(0).knock, 0);
  // two bumps early in each period, nothing after
  assert.equal(knockTap(0), 0);
  assert.ok(knockTap(0.066) > 0.95, 'first rap');
  assert.ok(knockTap(0.154) < 0.01, 'between the raps');
  assert.ok(knockTap(0.242) > 0.95, 'second rap');
  assert.equal(knockTap(0.6), 0);
  assert.equal(knockTap(1.1 + 0.6), 0);
});
