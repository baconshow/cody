// cursor.js — the computer's mouse pointer on the phone, like the Bluey app (where the iPhone follows the Mac's
// cursor): while the page is visible, it asks the server where the mouse is (/api/cursor, -1 to 1 across all
// screens, y pointing down) ten times a second and reports when it moves. Without a token, off Windows or on error,
// it waits and slowly tries again; none of that stops the face.
//
//   createCursor({ api, onMove }) → { start(), stop(), readNow() → Promise<boolean> }
//     api      { cursor(), hasToken() } (api.js; a fake one in the tests)
//     onMove   ({ x, y }) when the pointer moved more than CURSOR.minimum since the last read

export const CURSOR = Object.freeze({ period: 100, slow: 2000, minimum: 0.002 });   // ms, ms, fraction of the screen

export function createCursor({ api, onMove }) {
  const st = { timer: 0, on: false, last: null };

  async function readNow() {
    const p = await api.cursor();
    if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return false;
    const moved = !st.last || Math.abs(p.x - st.last.x) + Math.abs(p.y - st.last.y) > CURSOR.minimum;
    if (moved) {
      st.last = { x: p.x, y: p.y };
      onMove(st.last);
    }
    return true;
  }

  async function step() {
    let wait = CURSOR.period;
    try {
      if (!(await readNow())) wait = CURSOR.slow;         // off Windows or a locked screen
    } catch {
      wait = CURSOR.slow;                                 // server offline: signal.js already shows that
    }
    if (st.on) st.timer = setTimeout(step, wait);
  }

  return {
    readNow,
    start() {
      if (st.on || !api.hasToken()) return;
      st.on = true;
      step();
    },
    stop() {
      st.on = false;
      clearTimeout(st.timer);
    },
  };
}
