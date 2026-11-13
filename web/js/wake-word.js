// wake-word.js — the wake word for voice commands: while the page is visible, the phone keeps listening and, when
// it hears "Cody" (or "Claude", or one of the many things recognition writes instead: "Kodi", "Cory", "códi"...),
// what comes after it is the command. If only the word was said, the face stays listening and the next sentence is
// the command. After an answer the microphone may stay open for a while (open): what is said then is the command,
// with no word needed, so a conversation does not start with "Cody" every time. It is the same speech recognition as
// holding the face (in Chrome on Android, Google's service); it stops by itself after a silence and starts again,
// and on Android each restart may beep.
//
// Recognition offers more than one guess for what it heard; the word is looked for in all of them, since "Cody" is
// often the second guess. Accents and capitals do not matter. A session that went quiet for too long without ever
// ending (it happens) is started again.
//
//   findCommand(text) → { woke, command }   whether the wake word is there and what came after it
//   createWakeWord({ Recognizer, onWake, onPartial, onCommand, onGiveUp, onDenied, onHeard, onTrouble }) →
//     { start(), stop(), pause(), resume(), open(ms), rest(), active, awake }
//     onWake()            heard only the word: waits for the command
//     onPartial(text)     what can already be shown of the command while it is being spoken
//     onCommand(text)     the whole command, to send
//     onGiveUp()          it was waiting for a command and nobody said anything within the wait
//     onDenied()          the browser denied the microphone: listening turns off
//     onHeard()           recognition heard speech, whatever it was (the light can show the microphone is alive)
//     onTrouble(error)    recognition failed for a reason worth telling ('audio-capture', 'network'...); null: fine again
//     open(ms)            waits for a command now, without the word, for ms (after an answer)

import { joinTranscript } from './transcript.js';
import { language, locale } from './i18n.js';

// wait: how long it waits for the command after the word · stale: a session silent this long is started again
export const WAKE = Object.freeze({ wait: 8000, restart: 350, minimum: 2, stale: 45000, guesses: 4 });
// "Cody" or "Claude" as recognition tends to write them, without accents (the text is compared without them too)
const NAMES = Object.freeze({
  en: ['cody', 'kody', 'codi', 'kodi', 'codie', 'codey', 'cory', 'corey', 'kory', 'claude', 'claud', 'cloud', 'clod', 'clode'],
  'pt-BR': ['cody', 'kody', 'codi', 'kodi', 'codie', 'cory', 'cori', 'kori', 'coudi', 'claude', 'claud', 'claudi', 'claudio',
    'cloud', 'clode', 'clodi', 'clovis'],
});
const QUIET = new Set(['no-speech', 'aborted']);          // not trouble: nobody spoke, or it was stopped on purpose
const DENIED = new Set(['not-allowed', 'service-not-allowed']);
const word = (names) => new RegExp(`\\b(${names.join('|')})\\b[\\s,.!?:;-]*`, 'i');
const WORD = Object.freeze({ en: word(NAMES.en), 'pt-BR': word(NAMES['pt-BR']) });

// the text without accents, letter for letter (the same length, so a place in one is the same place in the other)
const plain = (text) => text.replace(/[^\u0000-\u007f]/g, (ch) => ch.normalize('NFD')[0]);

export function findCommand(text) {
  const said = String(text || '').normalize('NFC');
  const found = (WORD[language()] ?? WORD.en).exec(plain(said));
  if (!found) return { woke: false, command: '' };
  return { woke: true, command: said.slice(found.index + found[0].length).trim() };
}

// what was heard: recognition's first guess and, for the last piece, its other guesses
function guesses(results) {
  const texts = [joinTranscript(results)];
  const last = results[results.length - 1];
  for (let i = 1; i < (last?.length || 0); i += 1) texts.push(joinTranscript([...results.slice(0, -1), [last[i]]]));
  return texts;
}

export function createWakeWord({
  Recognizer, onWake, onPartial, onCommand, onGiveUp, onDenied = () => {}, onHeard = () => {}, onTrouble = () => {},
}) {
  const st = { active: false, paused: false, recognition: null, awake: false, giveUp: 0, restart: 0, stale: 0, wait: WAKE.wait };

  // waits for the command; every word heard meanwhile pushes the end of the wait further
  function expect(ms = st.wait) {
    st.awake = true;
    st.wait = ms;
    clearTimeout(st.giveUp);
    st.giveUp = setTimeout(() => { st.awake = false; onGiveUp(); }, ms);
  }

  function deliver(command) {
    st.awake = false;
    clearTimeout(st.giveUp);
    onCommand(command);
    st.recognition?.stop();                              // start again clean: the sentence is done
  }

  function hear(e) {
    const results = Array.from(e.results);
    if (!results.length) return;
    watch();
    const heard = guesses(results);
    const final = results[results.length - 1].isFinal;
    if (heard[0]) onHeard();
    // the word is in this session: the command is what follows it; it woke in an earlier session (recognition
    // restarted after the silence) or the microphone was left open: the whole sentence is the command
    const found = heard.map(findCommand).find((f) => f.woke);
    if (!found && !st.awake) return;
    const command = found ? found.command : heard[0];
    if (!st.awake) { expect(WAKE.wait); onWake(); } else if (command) expect();   // still talking: no giving up mid-sentence
    if (command) onPartial(command);
    if (final && command.length >= WAKE.minimum) deliver(command);
  }

  // a session that neither hears nor ends is started again
  function watch() {
    clearTimeout(st.stale);
    st.stale = setTimeout(() => { halt(); begin(); }, WAKE.stale);
  }

  function begin() {
    if (!st.active || st.paused || st.recognition || !Recognizer) return;
    const recognition = new Recognizer();
    recognition.lang = locale();
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = WAKE.guesses;
    recognition.onresult = hear;
    recognition.onstart = () => onTrouble(null);
    recognition.onerror = (e) => {
      if (DENIED.has(e?.error)) {
        st.active = false;
        onDenied();                                      // no microphone permission: the button turns off
      } else if (!QUIET.has(e?.error)) onTrouble(String(e?.error || 'error'));   // silence: onend restarts
    };
    recognition.onend = () => {
      if (st.recognition !== recognition) return;        // an old session ending late
      st.recognition = null;
      clearTimeout(st.restart);
      clearTimeout(st.stale);
      st.restart = setTimeout(begin, WAKE.restart);
    };
    st.recognition = recognition;
    watch();
    try { recognition.start(); } catch { st.recognition = null; }
  }

  function halt() {
    clearTimeout(st.restart);
    clearTimeout(st.stale);
    const recognition = st.recognition;
    st.recognition = null;
    try { recognition?.abort(); } catch { /* already stopped */ }
  }

  return {
    get active() { return st.active; },
    get awake() { return st.awake; },
    start() { st.active = true; begin(); },
    stop() { st.active = false; st.awake = false; clearTimeout(st.giveUp); halt(); },
    pause() { st.paused = true; halt(); },
    rest() { st.awake = false; clearTimeout(st.giveUp); },   // no longer waiting for a command (the mascot is about to speak)
    resume() { st.paused = false; begin(); },
    // the microphone stays open for a command without the word (after an answer); false when it is not listening
    open(ms = WAKE.wait) {
      if (!st.active || st.paused || !Recognizer) return false;
      expect(ms);
      return true;
    },
  };
}
