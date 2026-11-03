// wake-word.js — the wake word for voice commands: while the page is visible, the phone keeps listening and, when
// it hears "Cody" (or "Claude", which sounds alike and catches what recognition mishears), what comes after it is the command. In
// Portuguese the words are the same. If only the word was said, the face stays listening and the next
// sentence is the command. It is the same speech recognition as holding the face (in Chrome on Android, Google's
// service); it stops by itself after a silence and starts again, and on Android each restart may beep.
//
//   findCommand(text) → { woke, command }   whether the wake word is there and what came after it
//   createWakeWord({ Recognizer, onWake, onPartial, onCommand, onGiveUp, onDenied }) → { start(), stop(), pause(),
//     resume(), active }
//     onWake()            heard only the word: waits for the command
//     onPartial(text)     what can already be shown of the command while it is being spoken
//     onCommand(text)     the whole command, to send
//     onGiveUp()          woke up and nobody said anything within WAKE.wait
//     onDenied()          the browser denied the microphone: listening turns off

import { joinTranscript } from './transcript.js';
import { language, locale } from './i18n.js';

export const WAKE = Object.freeze({ wait: 8000, restart: 350, minimum: 2 });
// "Cody" or "Claude", with the spellings recognition tends to return for each language
const WORD = Object.freeze({
  en: /\b(cody|kody|codi|claude|claud|cloud|clod)\b[\s,.!?:;-]*/i,
  'pt-BR': /\b(cody|kody|codi|códi|kódi|claude|cláudio|claudio|cloud|clóvis)\b[\s,.!?:;-]*/i,
});

export function findCommand(text) {
  const found = (WORD[language()] ?? WORD.en).exec(String(text || ''));
  if (!found) return { woke: false, command: '' };
  return { woke: true, command: text.slice(found.index + found[0].length).trim() };
}

export function createWakeWord({ Recognizer, onWake, onPartial, onCommand, onGiveUp, onDenied = () => {} }) {
  const st = { active: false, paused: false, recognition: null, awake: false, giveUp: 0, restart: 0 };

  function wake() {
    st.awake = true;
    clearTimeout(st.giveUp);
    st.giveUp = setTimeout(() => { st.awake = false; onGiveUp(); }, WAKE.wait);
    onWake();
  }

  function deliver(command) {
    st.awake = false;
    clearTimeout(st.giveUp);
    onCommand(command);
    st.recognition?.stop();                              // start again clean: the sentence is done
  }

  function hear(e) {
    const results = Array.from(e.results);
    const text = joinTranscript(results);
    const final = results.length > 0 && results[results.length - 1].isFinal;
    // the word is in this session: the command is what follows it; it woke in an earlier session (recognition
    // restarted after the silence): the whole sentence is the command
    const found = findCommand(text);
    if (!found.woke && !st.awake) return;
    const command = found.woke ? found.command : text;
    if (!st.awake) wake();
    if (command) onPartial(command);
    if (final && command.length >= WAKE.minimum) deliver(command);
  }

  function begin() {
    if (!st.active || st.paused || st.recognition || !Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = locale();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = hear;
    recognition.onerror = (e) => {
      if (e?.error !== 'not-allowed' && e?.error !== 'service-not-allowed') return;   // silence, network: onend restarts
      st.active = false;
      onDenied();                                        // no microphone permission: the button turns off
    };
    recognition.onend = () => {
      st.recognition = null;
      clearTimeout(st.restart);
      st.restart = setTimeout(begin, WAKE.restart);
    };
    st.recognition = recognition;
    try { recognition.start(); } catch { st.recognition = null; }
  }

  function halt() {
    clearTimeout(st.restart);
    const recognition = st.recognition;
    st.recognition = null;
    try { recognition?.abort(); } catch { /* already stopped */ }
  }

  return {
    get active() { return st.active; },
    start() { st.active = true; begin(); },
    stop() { st.active = false; st.awake = false; clearTimeout(st.giveUp); halt(); },
    pause() { st.paused = true; halt(); },
    resume() { st.paused = false; begin(); },
  };
}
