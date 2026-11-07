// Tests for the timers set by voice (web/js/timers.js) and the heads-up from the Claude Code hooks
// (web/js/alerts.js): the countdown text, the rows of the panel, ringing once, chiming, stopping on a tap or after a
// minute, the computer's clock, and announcing only what is new.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimers, timerRows, formatLeft, TIMERS } from '../../web/js/timers.js';
import { createAlerts } from '../../web/js/alerts.js';

const S = 1000;

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)) };
}

// skew: how many seconds the computer's clock is ahead of the phone's
function scenario({ timers, skew = 0, storage = memoryStorage() }) {
  const st = { now: 1000 * S, rows: [], rung: [], chimes: 0, timers };
  const api = { hasToken: () => true, timers: async () => ({ now: st.now / S + skew, timers: st.timers }) };
  const clock = createTimers({
    api, storage, clock: () => st.now,
    onChange: (rows) => { st.rows = rows; }, onRing: (t) => st.rung.push(t.id), onChime: () => { st.chimes += 1; },
  });
  return { st, clock, storage };
}

test('the countdown reads like a clock', () => {
  assert.equal(formatLeft(272 * S), '4:32');
  assert.equal(formatLeft(3723 * S), '1:02:03');
  assert.equal(formatLeft(400), '0:01', 'a part of a second still shows one');
  assert.equal(formatLeft(-5), '0:00');
});

test('rows: soonest first, a ringing one on top, a far reminder as a time of day', () => {
  const now = 1000 * S;
  const rows = timerRows([
    { id: 'a', label: 'tea', kind: 'timer', ends_at: 1300 },
    { id: 'b', label: 'call Ana', kind: 'reminder', ends_at: 1000 + 7200 },
    { id: 'c', label: 'pizza', kind: 'timer', ends_at: 990 },
    { id: 'd', label: 'gone', kind: 'timer', ends_at: 900 },
  ], now, new Set(['c']));
  assert.deepEqual(rows.map((r) => r.id), ['c', 'a', 'b']);
  assert.equal(rows[0].ringing, true);
  assert.equal(rows[2].clock, true);
  assert.equal(rows[1].clock, false);
});

test('an ended timer rings once, chimes, and a tap stops it for good', async () => {
  const { st, clock, storage } = scenario({ timers: [{ id: 'p1', label: 'pizza', kind: 'timer', ends_at: 1010, say: "Time's up: pizza." }] });
  await clock.readNow();
  assert.equal(st.rows[0].left, 10 * S);
  st.now += 10 * S;
  await clock.readNow();
  assert.deepEqual(st.rung, ['p1']);
  assert.equal(st.rows[0].ringing, true);
  st.now += TIMERS.chime;
  await clock.readNow();
  assert.equal(st.chimes, 1);
  assert.deepEqual(st.rung, ['p1'], 'rings once, then only chimes');
  assert.equal(clock.dismiss(), true);
  assert.deepEqual(st.rows, []);
  const again = scenario({ timers: st.timers, storage });
  again.st.now = st.now;
  await again.clock.readNow();
  assert.deepEqual(again.st.rung, [], 'dismissed on this phone: a reload does not ring it again');
});

test('left alone, it stops ringing after a minute', async () => {
  const { st, clock } = scenario({ timers: [{ id: 'p1', label: 'tea', kind: 'timer', ends_at: 999 }] });
  await clock.readNow();
  assert.equal(st.rows[0].ringing, true);
  st.now += TIMERS.ring;
  await clock.readNow();
  assert.deepEqual(st.rows, []);
});

test('the computer\'s clock counts, not the phone\'s', async () => {
  const { st, clock } = scenario({ timers: [{ id: 'p1', label: 'tea', kind: 'timer', ends_at: 1060 }], skew: 30 });
  await clock.readNow();
  assert.equal(st.rows[0].left, 30 * S, 'the phone runs 30 s behind the computer');
});

test('a timer cancelled by voice while ringing goes quiet', async () => {
  const { st, clock } = scenario({ timers: [{ id: 'p1', label: 'tea', kind: 'timer', ends_at: 999 }] });
  await clock.readNow();
  st.timers = [];
  await clock.readNow();
  assert.deepEqual(st.rows, []);
  st.now += TIMERS.chime;
  await clock.readNow();
  assert.equal(st.chimes, 0);
});

test('heads-up: the first read only marks the place, later events are announced once', async () => {
  const seen = [];
  const answers = [
    { cursor: 3, events: [{ seq: 3, kind: 'done', say: 'old' }] },
    { cursor: 5, events: [{ seq: 4, kind: 'done', seconds: 60, say: 'Done!' }, { seq: 5, kind: 'needs_you', say: 'Come!' }] },
    { cursor: 0, events: [] },                                   // the server restarted
    { cursor: 1, events: [{ seq: 1, kind: 'needs_you', say: 'Again!' }] },
    { cursor: 3, events: [{ seq: 2, kind: 'notice', say: 'WhatsApp: Ana', app: 'WhatsApp' }, { seq: 3, kind: 'moon', say: 'no' }] },
  ];
  const asked = [];
  const api = { hasToken: () => true, events: async (after) => { asked.push(after); return answers.shift(); } };
  const alerts = createAlerts({ api, onAlert: (e) => seen.push(e.say) });
  for (let i = 0; i < 5; i++) await alerts.readNow();
  assert.deepEqual(seen, ['Done!', 'Come!', 'Again!', 'WhatsApp: Ana'], 'a notice is announced; an unknown kind is not');
  assert.deepEqual(asked, [0, 3, 5, 0, 1]);
});
