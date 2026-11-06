// stale-page.js — the server makes a new token each time it starts, so a page left open (a phone on the desk) stops
// being answered after a restart: every /api route says 403 and the mascot goes deaf without saying why. The page
// then reloads itself to get the new token, at most once per RELOAD_EVERY, so a real refusal can never loop.
//
//   reloadIfStale(status, error, { storage, now, reload }) → true if it asked for the reload
//     storage   sessionStorage (or null): where the last reload is noted; without it, no reload

export const TOKEN_REFUSED = 'missing or invalid token';   // the server's message (cody/server.py)
export const RELOAD_EVERY = 30000;
const LAST = 'cody:reloadedAt';

export function reloadIfStale(status, error, { storage, now = Date.now, reload }) {
  if (status !== 403 || error !== TOKEN_REFUSED) return false;
  try {
    if (now() - (Number(storage.getItem(LAST)) || 0) < RELOAD_EVERY) return false;
    storage.setItem(LAST, String(now()));
  } catch {
    return false;                                        // nowhere to note it: better deaf than in a reload loop
  }
  reload();
  return true;
}
