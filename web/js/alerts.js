// alerts.js — heads-up from the Claude Code sessions on the computer, through Claude Code hooks (cody/hooks.py): a
// long task finished ("done"), Claude is waiting for permission ("needs_you") or, if you turned it on, an
// important Windows notification came in ("notice": the app and the title). Reads /api/events every few
// seconds; the first read only marks where the list is, so the past is never announced.
//
//   createAlerts({ api, onAlert }) → { start(), stop(), readNow() }
//     onAlert   ({ seq, kind: 'done' | 'needs_you' | 'notice', seconds, say, app }) once per event

export const ALERTS = Object.freeze({ poll: 3000, slow: 30000 });
const KINDS = new Set(['done', 'needs_you', 'notice']);

export function createAlerts({ api, onAlert }) {
  const st = { after: null, timer: 0, on: false };

  async function readNow() {
    const r = await api.events(st.after ?? 0);
    const cursor = Number(r?.cursor);
    if (!Number.isFinite(cursor)) return;
    if (st.after !== null && cursor >= st.after) {
      for (const e of Array.isArray(r?.events) ? r.events : []) {
        if (Number(e?.seq) > st.after && KINDS.has(e.kind)) onAlert(e);
      }
    }
    st.after = cursor;                                   // also when the server restarted and counts from 0 again
  }

  async function step() {
    let wait = ALERTS.poll;
    try { await readNow(); } catch { wait = ALERTS.slow; }
    if (st.on) st.timer = setTimeout(step, wait);
  }

  return {
    readNow,
    start() {
      if (st.on || !api.hasToken()) return;
      st.on = true;
      st.after = null;                                  // back from hidden: what happened meanwhile is old news
      step();
    },
    stop() {
      st.on = false;
      clearTimeout(st.timer);
    },
  };
}
