// signal.js — what Claude is doing, for the mascot's face. Reads /api/state and /api/activity (api.js, with the
// token the server puts in the page) and feeds the mascot's life (createLife, life.js), which turns tool events into
// short time windows.
//
//   createSignal({ api, clock }) → { start(), stop(), read() → reading | null, readNow() → Promise }
//     api    { state(), activity(cursor), hasToken() } (api.js; a fake one in the tests)
//     clock  () → ms (default: performance.now)
//   reading (the same object on every call; nothing is allocated per frame):
//     online       the server answered the last request
//     claudeOpen   Claude is running on the machine (/api/state, claude_open)
//     working      called a tool in the last 10 s
//     terminal     Bash or PowerShell in the last 5 s
//     code         Edit or Write on a code file in the last 5 s (the server's `code` flag)
//     away         a call that leaves the machine (web, MCP) in the last 5 s
//     search       looked something up (Grep, Glob, WebSearch, WebFetch) in the last 6 s: the magnifier
//     idleSeconds  seconds since the last tool event or user input
//     finished     how many agents have finished (a counter: the reader compares it with the previous value)
//     music        something is playing on the computer (the server's `music` flag, cody/media.py): the headphones
// Without a token (the page opened as /web/index.html), read() returns null and the face stays in the idle cycle.

import { createLife } from './life.js';

export const PERIOD = Object.freeze({ activity: 3000, state: 15000, max: 60000 });   // ms; doubles on error
const AWAY_WINDOW = 5000;                                // ms: a call that leaves the machine counts as "away" this long
const SEARCH_WINDOW = 6000;
const FAILED_WINDOW = 8000;                             // ms: the debug scene stays this long after a failure                              // ms: the magnifier stays in hand this long after the last search
const SEARCH = new Set(['Grep', 'Glob', 'WebSearch', 'WebFetch']);

export function createSignal({ api, clock = () => performance.now() }) {
  const life = createLife(clock());
  const st = { cursor: 0, first: true, lastSignal: '', agents: null, external: 0, awaySince: -Infinity, searchSince: -Infinity, failedSince: -Infinity, read: false, music: false };
  const timers = new Map();                              // route → the setTimeout of its next read
  const out = {};
  const reading = {};

  // active agents that vanished since the previous read have finished (the mascot's little hop)
  function compareAgents(sessions) {
    const active = new Set();
    for (const s of sessions) for (const a of s?.agents || []) if (a?.active) active.add(`${s.id}/${a.id}`);
    if (st.agents) for (const id of st.agents) if (!active.has(id)) life.agentFinished();
    st.agents = active;
  }

  // a session that moved without calling a tool (user input) also wakes the mascot
  function signalFromSessions(sessions, now) {
    const last = sessions.reduce((m, s) => (typeof s?.last_ts === 'string' && s.last_ts > m ? s.last_ts : m), '');
    if (!st.first && last > st.lastSignal) life.signal(now);
    if (last > st.lastSignal) st.lastSignal = last;
  }

  async function readActivity() {
    const r = await api.activity(st.cursor);
    const now = clock();
    const events = (Array.isArray(r?.events) ? r.events : []).filter((e) => Number(e?.seq) > st.cursor);
    // the first read brings recent history: it sets the cursor, it is not news
    if (!st.first) {
      for (const e of events) {
        if (e.tool === '!failed') { st.failedSince = now; continue; }
        life.register(e.tool, e.code === true, now);
        if (SEARCH.has(e.tool)) st.searchSince = now;
      }
    }
    if (Number.isFinite(Number(r?.cursor))) st.cursor = Number(r.cursor);
    st.music = r?.music === true;
    const sessions = Array.isArray(r?.sessions) ? r.sessions : [];
    compareAgents(sessions);
    signalFromSessions(sessions, now);
    st.first = false;
  }

  async function readState() {
    const e = await api.state();
    life.setClaudeOpen(e?.claude_open !== false);
  }

  // one loop per route: on error, mark offline and wait twice as long (up to the max); on success, back to the period
  function loop(name, readRoute, period) {
    let wait = period;
    const step = async () => {
      try {
        await readRoute();
        life.setOnline(true);
        wait = period;
      } catch {
        life.setOnline(false);
        wait = Math.min(wait * 2, PERIOD.max);
      }
      st.read = true;
      if (timers.has(name)) timers.set(name, setTimeout(step, wait));
    };
    timers.set(name, null);
    step();
  }

  function read() {
    if (!api.hasToken() || !st.read) return null;
    const now = clock();
    life.read(now, out);
    if (out.external !== st.external) { st.external = out.external; st.awaySince = now; }
    reading.online = out.online;
    reading.claudeOpen = out.claudeOpen;
    reading.working = out.thinking;
    reading.terminal = out.terminal;
    reading.code = out.code;
    reading.away = now - st.awaySince <= AWAY_WINDOW;
    reading.search = now - st.searchSince <= SEARCH_WINDOW;
    reading.failed = now - st.failedSince <= FAILED_WINDOW;
    reading.idleSeconds = out.idleSeconds;
    reading.finished = out.finished;
    reading.music = st.music;
    return reading;
  }

  return {
    read,
    start() {
      if (!api.hasToken() || timers.size) return;
      loop('activity', readActivity, PERIOD.activity);
      loop('state', readState, PERIOD.state);
    },
    stop() { timers.forEach((id) => clearTimeout(id)); timers.clear(); },
    // one read of both routes, without the loop (for the tests)
    async readNow() { await readActivity(); await readState(); st.read = true; },
  };
}
