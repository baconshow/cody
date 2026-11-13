// claude-mood.js — the mood Claude's activity asks of the face. Takes the reading from signal.js and returns one of
// the seven moods (moods.js). Pure logic: it runs in Node for the tests.
//
//   claudeMood(reading) → mood
//     reading   { online, claudeOpen, working, terminal, code, away, search, idleSeconds, finished } (signal.js)
//
// The default rule: with Claude closed or the server offline, it sleeps; 2 minutes without a signal, it gets sleepy;
// 10 minutes, it sleeps (eyes closed and the zzZ rising); with nothing going on, it listens. What each kind of work
// shows is a basic default, meant to be tuned with the face running. What comes before it, in cycle.js: a pat (a
// tap) and an agent that finished, which make the face happy for a moment.

export const SLEEP = Object.freeze({ sleepy: 120, sleep: 600 });   // seconds without a signal

// the prop it picks up for what Claude is doing: searching, the magnifier at its eye; writing code, the keyboard
export function claudeProp(reading) {
  if (!reading?.claudeOpen || !reading.online) return null;
  if (reading.typing) return 'keyboard';                 // you are typing in a Claude window: Cody types along
  if (reading.search) return 'magnifier';
  return reading.code ? 'keyboard' : null;
}

export function claudeMood(reading) {
  if (!reading.claudeOpen || !reading.online) return 'resting';
  if (reading.search) return 'listening';               // searching: attentive, magnifier at the eye (claudeProp)
  if (reading.away) return 'pointing';                  // called the web or a service: points outward
  if (reading.code) return 'listening';                 // writing code: focused, typing (claudeProp)
  if (reading.terminal || reading.working) return 'thinking';
  if (reading.idleSeconds >= SLEEP.sleep) return 'resting';
  if (reading.idleSeconds >= SLEEP.sleepy) return 'sleepy';
  return 'listening';
}
