// cycle.js — the face's mood when the page has no ?mood=. In order:
//   0. the voice conversation (voice.js): listening while you hold the face and talk, thinking until the reply,
//      talking;
//   1. a pat (a tap) and an agent that finished: happy for a moment;
//   2. Claude's activity (signal.js, read by claudeMood): what it is doing right now;
//   3. the idle cycle, driven only by the pointer: it moved, the face listens (and follows it with its eyes); it
//      stopped, the face thinks for a bit, then gets sleepy and rests. The pointer coming back wakes it up happy.
//
//   createCycle({ fast, signal }) → { mood(now), prop(), moved(now), touched(now), setVoice(mood | null),
//     cheer(now), alert(mood, seconds, now) }
//     cheer    happy for a moment (a timer rang, a long task finished)
//     alert    a mood for a few seconds, above Claude's activity (pointing: Claude needs you, or the mini Cody on the
//              computer screen is pointing at something)
//     fast     the whole idle cycle in 1/6 of the time (?cycle=fast), to check it without waiting
//     signal   { read() → reading | null } (signal.js); without it, or with read() null, only the pointer counts

import { SLEEPING } from './moods.js';
import { claudeMood, claudeProp } from './claude-mood.js';

// seconds without the pointer moving
export const CYCLE = Object.freeze({ think: [12, 17], sleepy: 45, rest: 80, celebrate: 1.6 });
const FAST = 1 / 6;

export function createCycle({ fast = false, signal = null } = {}) {
  const k = fast ? FAST : 1;
  const st = { activity: null, happyUntil: -Infinity, finished: null, voice: null, reading: null, alert: null };

  function idle(now) {
    const still = now - st.activity;
    if (still >= CYCLE.rest * k) return 'resting';
    if (still >= CYCLE.sleepy * k) return 'sleepy';
    if (still >= CYCLE.think[0] * k && still < CYCLE.think[1] * k) return 'thinking';
    return 'listening';
  }

  function mood(now) {
    if (st.activity === null) st.activity = now;
    const reading = signal?.read() ?? null;
    st.reading = reading;
    if (reading) {
      // an agent finished since the previous read: celebrate
      if (st.finished !== null && reading.finished > st.finished) st.happyUntil = now + CYCLE.celebrate;
      st.finished = reading.finished;
    }
    if (st.voice) return st.voice;
    if (st.alert && now < st.alert.until) return st.alert.mood;
    if (now < st.happyUntil) return 'happy';
    return (reading && claudeMood(reading)) || idle(now);
  }

  return {
    mood,
    // the prop in hand (magnifier, keyboard) for what Claude is doing; during a voice conversation, hands free
    prop() { return st.voice || !st.reading ? null : claudeProp(st.reading); },
    // the voice conversation drives the face while it lasts; null hands it back to the cycle
    setVoice(mood) { st.voice = mood || null; },
    // the pointer came back: if the face was asleep, it wakes up happy
    moved(now) {
      if (st.activity !== null && SLEEPING.has(mood(now))) st.happyUntil = now + CYCLE.celebrate;
      st.activity = now;
    },
    // a tap or a click: a pat
    touched(now) {
      st.happyUntil = now + CYCLE.celebrate;
      st.activity = now;
    },
    cheer(now) { st.happyUntil = now + CYCLE.celebrate; },
    alert(mood, seconds, now) { st.alert = { mood, until: now + seconds }; },
  };
}
