// timers.js — the timers and reminders set by voice ("Cody, set a timer for ten minutes", "remind me at three to
// call Ana"). The voice channel writes them on the computer (cody/timers.py); this reads /api/timers every few
// seconds, counts down here (corrected by the computer's clock) and rings when one ends: once per timer, then a
// chime every few seconds until it is dismissed or a minute goes by. Dismissed timers are remembered in the browser,
// so a reload does not ring them again.
//
//   createTimers({ api, storage, clock, onChange, onRing, onChime }) → { start(), stop(), dismiss(), readNow() }
//     onChange  (rows) on every tick, for the panel (timerRows)
//     onRing    (timer) when it starts ringing: { id, label, kind, say }
//     onChime   () every TIMERS.chime ms while something rings
//   timerRows(timers, now, ringing) → rows, soonest first and the ringing ones on top (pure, for the tests)
//   formatLeft(ms) → "4:32" | "1:02:03"

export const TIMERS = Object.freeze({
  poll: 5000, slow: 30000, tick: 250, ring: 60000, chime: 4000, rows: 4, clockFrom: 3600000, kept: 50,
});
const DISMISSED = 'cody:dismissedTimers';

// the browser's storage, or null where reading it throws (blocked storage, some private tabs)
function safeStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function formatLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// ringing: Set of the ids ringing on this phone now
export function timerRows(timers, now, ringing) {
  const rows = [];
  for (const t of timers) {
    const at = Number(t.ends_at) * 1000;
    if (!Number.isFinite(at)) continue;
    const left = at - now;
    if (left > 0) {
      rows.push({ id: t.id, label: t.label || '', kind: t.kind, at, left, ringing: false,
        clock: t.kind === 'reminder' && left >= TIMERS.clockFrom });
    } else if (ringing.has(t.id)) {
      rows.push({ id: t.id, label: t.label || '', kind: t.kind, at, left: 0, ringing: true, clock: false });
    }
  }
  rows.sort((a, b) => (b.ringing - a.ringing) || (a.at - b.at));
  return rows.slice(0, TIMERS.rows);
}

function loadDismissed(storage) {
  try {
    const list = JSON.parse(storage?.getItem(DISMISSED) || '[]');
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}

export function createTimers({ api, storage = safeStorage(), clock = () => Date.now(), onChange = () => {}, onRing = () => {}, onChime = () => {} }) {
  const st = { timers: [], offset: 0, poll: 0, tick: 0, on: false, chimedAt: -Infinity, missing: new Map() };
  const dismissed = loadDismissed(storage);
  const ringing = new Map();                           // id → when it started ringing here (ms)
  const now = () => clock() + st.offset;

  function saveDismissed() {
    const list = [...dismissed].slice(-TIMERS.kept);
    try { storage?.setItem(DISMISSED, JSON.stringify(list)); } catch { /* no storage: this visit only */ }
  }

  // ended and neither dismissed nor rung for a whole minute: rings; a minute later it stops by itself
  function update() {
    const t = now();
    for (const timer of st.timers) {
      const ended = Number(timer.ends_at) * 1000 <= t;
      if (!ended || dismissed.has(timer.id)) continue;
      if (!ringing.has(timer.id)) {
        ringing.set(timer.id, t);
        st.chimedAt = t;
        onRing(timer);
      } else if (t - ringing.get(timer.id) >= TIMERS.ring) {
        ringing.delete(timer.id);
        dismissed.add(timer.id);
        saveDismissed();
      }
    }
    if (ringing.size && t - st.chimedAt >= TIMERS.chime) { st.chimedAt = t; onChime(); }
    onChange(timerRows(st.timers, t, ringing));
  }

  async function readNow() {
    const r = await api.timers();
    if (Number.isFinite(Number(r?.now))) st.offset = Number(r.now) * 1000 - clock();
    st.timers = (Array.isArray(r?.timers) ? r.timers : []).filter((x) => typeof x?.id === 'string');
    // cancelled while ringing: gone from two reads in a row (one empty read, a file held open for a moment, is not
    // enough: the timer would ring again on the next one)
    const known = new Set(st.timers.map((x) => x.id));
    for (const id of ringing.keys()) {
      if (known.has(id)) { st.missing.delete(id); continue; }
      st.missing.set(id, (st.missing.get(id) ?? 0) + 1);
      if (st.missing.get(id) >= 2) { ringing.delete(id); st.missing.delete(id); dismissed.add(id); saveDismissed(); }
    }
    update();
  }

  async function poll() {
    let wait = TIMERS.poll;
    try { await readNow(); } catch { wait = TIMERS.slow; }
    if (st.on) st.poll = setTimeout(poll, wait);
  }

  return {
    readNow,
    start() {
      if (st.on || !api.hasToken()) return;
      st.on = true;
      poll();
      st.tick = setInterval(update, TIMERS.tick);
    },
    stop() {
      st.on = false;
      clearTimeout(st.poll);
      clearInterval(st.tick);
    },
    // a tap on the panel: whatever is ringing stops
    dismiss() {
      if (!ringing.size) return false;
      for (const id of ringing.keys()) dismissed.add(id);
      ringing.clear();
      saveDismissed();
      update();
      return true;
    },
  };
}
