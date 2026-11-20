// presence.js — whether this page is the one showing Cody. Not while it is hidden (a phone in a pocket, a minimized
// or covered window: document.hidden), and not while Cody is in its little window (pip.js), which then does the
// listening, the reading and the drawing. What only the page on screen should do (main.js: the voice, Claude's
// activity, the mouse, the alerts) watches this, instead of each listening for visibilitychange on its own.
//
//   createPresence(doc) → { hidden(), away, setAway(on), watch(fn) → stop() }
//     hidden  true while hidden or away
//     away    true while Cody is in its little window
//     watch   calls fn now and whenever hidden() may have changed

export function createPresence(doc) {
  const st = { away: false, watchers: new Set() };
  const tell = () => { for (const fn of [...st.watchers]) fn(); };
  doc.addEventListener('visibilitychange', tell);
  return {
    hidden: () => Boolean(doc.hidden) || st.away,
    get away() { return st.away; },
    setAway(on) {
      if (st.away === Boolean(on)) return;
      st.away = Boolean(on);
      tell();
    },
    watch(fn) {
      st.watchers.add(fn);
      fn();
      return () => st.watchers.delete(fn);
    },
  };
}
