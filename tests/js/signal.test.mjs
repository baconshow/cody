// Tests for the mascot's signal (web/js/signal.js) and the cycle that reads it (cycle.js): Claude's activity, read
// from a fake API, reaches the face through the life rules (createLife, life.js); the first read is history, not
// news; an agent that finishes makes the face happy; without a token the face follows only the pointer.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSignal } from '../../web/js/signal.js';
import { createCycle, CYCLE } from '../../web/js/cycle.js';
import { claudeMood, claudeProp, SLEEP } from '../../web/js/claude-mood.js';

// the fake API: each activity read returns the next batch; the clock is moved by hand. A batch item is a tool
// name, or { tool, code } for an event the server flags as a code edit
function scenario({ token = true } = {}) {
  const st = { now: 0, seq: 0, batches: [], sessions: [], open: true, music: undefined, typing: undefined };
  const api = {
    hasToken: () => token,
    state: async () => ({ claude_open: st.open }),
    activity: async (cursor) => {
      const events = (st.batches.shift() ?? []).map((e) => (
        typeof e === 'string' ? { seq: ++st.seq, tool: e, code: false } : { seq: ++st.seq, ...e }
      ));
      return { cursor: st.seq || cursor, events, sessions: st.sessions, music: st.music, typing: st.typing };
    },
  };
  const signal = createSignal({ api, clock: () => st.now });
  return { st, signal };
}

const session = (last, agents = []) => ({ id: 's1', last_ts: last, agents: agents.map((id) => ({ id, active: true })) });

test('the first read is history: earlier events do not wake the face', async () => {
  const { st, signal } = scenario();
  st.batches.push(['Bash', 'Edit']);
  await signal.readNow();
  const r = signal.read();
  assert.equal(r.working, false);
  assert.equal(r.terminal, false);
  assert.equal(r.claudeOpen, true);
});

test('a new tool call: working for 10 s, terminal for 5 s', async () => {
  const { st, signal } = scenario();
  await signal.readNow();
  st.now = 1000;
  st.batches.push(['Bash']);
  await signal.readNow();
  assert.deepEqual([signal.read().working, signal.read().terminal], [true, true]);
  st.now = 7000;
  assert.deepEqual([signal.read().working, signal.read().terminal], [true, false]);
  st.now = 12000;
  assert.equal(signal.read().working, false);
  assert.ok(Math.abs(signal.read().idleSeconds - 11) < 1e-9, `${signal.read().idleSeconds} s without a signal`);
});

test('a call that leaves the machine is "away" for 5 s; Claude closed shows in the reading', async () => {
  const { st, signal } = scenario();
  await signal.readNow();
  st.batches.push(['WebFetch']);
  st.open = false;
  await signal.readNow();
  assert.equal(signal.read().away, true);
  assert.equal(signal.read().claudeOpen, false);
  st.now = 6000;
  assert.equal(signal.read().away, false);
});

test('user input (a session that moved without a tool call) resets the time without a signal', async () => {
  const { st, signal } = scenario();
  st.sessions = [session('2025-01-01T10:00:00Z')];
  await signal.readNow();
  st.now = 90_000;
  assert.ok(signal.read().idleSeconds >= 90);
  st.sessions = [session('2025-01-01T10:01:30Z')];
  await signal.readNow();
  assert.equal(signal.read().idleSeconds, 0);
});

test('an agent that finishes makes the face happy, once', async () => {
  const { st, signal } = scenario();
  st.sessions = [session('2025-01-01T10:00:00Z', ['a1'])];
  await signal.readNow();
  const cycle = createCycle({ signal });
  assert.notEqual(cycle.mood(0), 'happy');
  st.sessions = [session('2025-01-01T10:00:05Z', [])];
  await signal.readNow();
  assert.equal(signal.read().finished, 1);
  assert.equal(cycle.mood(1), 'happy');
  assert.notEqual(cycle.mood(1 + CYCLE.celebrate + 0.1), 'happy', 'the celebration ends');
});

test('without a token the signal does not start and the face stays in the pointer cycle', async () => {
  const { signal } = scenario({ token: false });
  signal.start();
  assert.equal(signal.read(), null);
  const cycle = createCycle({ signal });
  assert.equal(cycle.mood(0), 'listening');
  assert.equal(cycle.mood(CYCLE.rest + 1), 'resting');
});

test('the default rule: sleeps with Claude closed, sleepy at 2 min, zzZ at 10, and with nothing going on, listens', () => {
  const base = { online: true, claudeOpen: true, working: false, terminal: false, code: false, away: false, idleSeconds: 0, finished: 0 };
  const mood = (change) => claudeMood({ ...base, ...change });
  assert.equal(mood({}), 'listening');
  assert.equal(mood({ claudeOpen: false }), 'resting');
  assert.equal(mood({ online: false }), 'resting');
  assert.equal(mood({ idleSeconds: SLEEP.sleepy - 1 }), 'listening');
  assert.equal(mood({ idleSeconds: SLEEP.sleepy }), 'sleepy');
  assert.equal(mood({ idleSeconds: SLEEP.sleep }), 'resting');
  assert.deepEqual([SLEEP.sleepy, SLEEP.sleep], [120, 600]);
  assert.equal(mood({ working: true, terminal: true }), 'thinking');
  assert.equal(mood({ working: true, code: true }), 'listening', 'writing code: focused on the keyboard');
  assert.equal(claudeProp({ ...base, working: true, code: true }), 'keyboard');
  assert.equal(claudeProp({ ...base, code: true, search: true }), 'magnifier', 'searching comes first');
  assert.equal(claudeProp({ ...base, search: true, typing: true }), 'keyboard', 'you typing comes before everything');
  assert.equal(claudeProp({ ...base, claudeOpen: false, typing: true }), null, 'no Claude, no keyboard');
  assert.equal(mood({ working: true, away: true }), 'pointing');
});

test('searching (Grep, Glob, WebSearch, WebFetch): the magnifier comes to hand for 6 s and the face is attentive', async () => {
  const { st, signal } = scenario();
  await signal.readNow();
  st.batches.push(['Grep']);
  await signal.readNow();
  const r = signal.read();
  assert.equal(r.search, true);
  assert.equal(claudeProp(r), 'magnifier');
  assert.equal(claudeMood(r), 'listening');
  st.now = 7000;
  assert.equal(claudeProp(signal.read()), null);
  st.open = false;
  st.batches.push(['WebSearch']);
  await signal.readNow();
  assert.equal(claudeProp(signal.read()), null, 'Claude closed: hands free');
});

test('the server\'s code flag: an edit on a code file brings the keyboard for 5 s; an edit on text does not', async () => {
  const { st, signal } = scenario();
  await signal.readNow();
  st.batches.push([{ tool: 'Write', code: false }]);
  await signal.readNow();
  assert.equal(signal.read().code, false, 'a Write the server did not flag is text');
  st.now = 1000;
  st.batches.push([{ tool: 'Edit', code: true }]);
  await signal.readNow();
  assert.equal(signal.read().code, true);
  assert.equal(claudeProp(signal.read()), 'keyboard');
  st.now = 6500;
  assert.equal(signal.read().code, false);
});

test('music: the server says whether something is playing, and the reading carries it (the headphones)', async () => {
  const { st, signal } = scenario();
  await signal.readNow();
  assert.equal(signal.read().music, false, 'an older server without the flag: no music');
  st.music = true;
  await signal.readNow();
  assert.equal(signal.read().music, true);
  st.music = 'yes';
  await signal.readNow();
  assert.equal(signal.read().music, false, 'only a true counts');
});
