// voice.js — voice commands for Claude (the mascot's voice channel: a Claude Code session running on the computer).
// Two ways to talk: hold the face, or call "Cody" (wake-word.js). The browser's speech recognition transcribes (in
// Chrome on Android, through Google's service), the text goes to /api/voice and the face thinks until the reply
// arrives (/api/voice/replies). The reply is spoken in the mascot's voice (voice-audio.js: ElevenLabs, or the
// device's own voice) and stays in the caption; a link, command or path Claude asked to show appears in the box at
// the bottom, which a tap copies (and opens, if it is a link). When Claude asks permission to run something, the
// mascot asks, shows the command and opens the microphone right away: "yes" approves, "no" denies (the channel turns
// the answer into a verdict).
//
//   createVoice({ api, win, target, onState, onCaption, onAttachment, onImage, onListening, onSide, t }) → { start(), stop(),
//     volume(), listen(on), listening, announce({ text, alert }), chime() }
//     api           { voice(text), voiceReplies(after), voiceAudio(seq) } (api.js)
//     target        the element that is held (the face's canvas)
//     onState       (mood | null): 'listening', 'thinking', 'talking'; null hands the face back to the cycle
//     onCaption     (text | null) what shows at the top · onAttachment (text | null) the box at the bottom
//     onImage       (id | null) a screenshot Claude took because it was asked for one (shown with Share)
//     onListening   (on) whether the wake word is on (the on-screen button)
//     onSide        (on) listening sideways: no word within VOICE.lowVoice while listening (speaking softly) or
//                   "didn't catch that"
//   announce        the mascot says something on its own (a timer ringing, Claude finished): in the caption and
//                   out loud, in turn with the replies; alert is the key of /api/voice/alert (the mascot's voice)
//   playAudio       an mp3 the page already has (the voice test in Settings): played in turn with the replies, the
//                   face talking while it lasts

import { joinTranscript } from './transcript.js';
import { createVoiceAudio } from './voice-audio.js';
import { createWakeWord } from './wake-word.js';
import { locale } from './i18n.js';

export { joinTranscript };

export const VOICE = Object.freeze({
  hold: 350, wait: 180000, caption: 9000, fast: 1200, slow: 4000, lowVoice: 2200, didntCatch: 3000,
});

export function createVoice({ api, win = window, target, onState, onCaption, onAttachment = () => {}, onImage = () => {}, onListening = () => {}, onSide = () => {}, onNotice = () => {}, t }) {
  const Recognizer = win.SpeechRecognition || win.webkitSpeechRecognition;
  const said = new Set();                             // each fallback is told once per visit, not on every reply
  const audio = createVoiceAudio({ api, win, onFallback: ({ from, to, reason }) => {
    const key = `${from}>${to}:${reason}`;
    if (said.has(key)) return;
    said.add(key);
    onNotice(t('mascot.voice.fallback', { from: t(`settings.voice.${from}`), to: t(`settings.voice.${to}`),
      reason: reason || t('mascot.voice.unavailable') }));
  } });
  const st = { hold: 0, recognition: null, text: '', after: null, session: null, waitUntil: 0, poll: 0, clear: 0, on: false, queue: Promise.resolve(), side: 0 };

  // listening sideways: the count starts when it begins to listen; the first word undoes it; "didn't catch that"
  // turns it for a while
  function side(on, ms = 0) {
    clearTimeout(st.side);
    if (ms) st.side = setTimeout(() => onSide(on), ms);
    else onSide(on);
  }
  const startedListening = () => { onSide(false); side(true, VOICE.lowVoice); };
  const wordArrived = () => side(false);

  function caption(text, fades = true) {
    clearTimeout(st.clear);
    onCaption(text);
    if (fades) st.clear = setTimeout(() => onCaption(null), VOICE.caption);
  }

  const wake = createWakeWord({
    Recognizer,
    onWake: () => { win.navigator.vibrate?.(25); onState('listening'); caption(t('mascot.voice.listening'), false); startedListening(); },
    onPartial: (text) => { wordArrived(); caption(t('mascot.voice.you', { text }), false); },
    onCommand: (text) => send(text),
    onGiveUp: () => { side(false); onState(null); onCaption(null); },
    onDenied: () => onListening(false),
  });

  // one reply at a time, without the microphone hearing the mascot itself
  function speak(reply) {
    st.queue = st.queue.then(async () => {
      caption(String(reply.text));
      if (!reply.alert) onAttachment(reply.show ? String(reply.show) : null);   // an alert leaves the link box alone
      if (reply.image) onImage(String(reply.image));
      wake.pause();
      onState('talking');
      await audio.speak(reply);
      onState(null);
      // a permission request (Claude wants to run something): open the microphone right away for "yes" or "no"
      if (reply.permission) openMic(false);
      else wake.resume();
    });
    return st.queue;
  }

  // a fact Claude saved: in the caption, in turn with the speech (never over a sentence being spoken)
  function note(text) {
    st.queue = st.queue.then(() => caption(t('mascot.voice.saved', { text })));
  }

  // the replies that are new since the last one seen; the first poll only marks where the queue is (the past is
  // never spoken)
  async function poll() {
    let wait = VOICE.slow;
    try {
      const r = await api.voiceReplies(st.after ?? 0);
      const session = typeof r?.session === 'string' ? r.session : null;
      if (session && st.session && session !== st.session && st.after !== null) {
        // the voice session restarted on the computer: its replies count from 1 again, so read them all
        st.session = session;
        st.after = 0;
        wait = VOICE.fast;
      } else {
        if (session) st.session = session;
        const list = Array.isArray(r?.replies) ? r.replies : [];
        const last = list.reduce((m, x) => Math.max(m, Number(x.seq) || 0), st.after ?? 0);
        if (st.after !== null) {
          for (const x of list) {
            if (!(Number(x.seq) > st.after)) continue;
            if (x.text) { st.waitUntil = 0; speak(x); } else if (x.note) note(String(x.note));
          }
        }
        st.after = last;
      }
    } catch { /* server offline: signal.js shows it; try again slowly */ }
    if (st.waitUntil) {
      wait = VOICE.fast;
      if (Date.now() > st.waitUntil) { st.waitUntil = 0; onState(null); caption(t('mascot.voice.noReply')); }
    }
    if (st.on) st.poll = setTimeout(poll, wait);
  }

  async function send(speech) {
    const text = String(speech || '').trim();
    if (!text) {
      onState(null);
      caption(t('mascot.voice.didntCatch'));
      side(true);
      st.side = setTimeout(() => onSide(false), VOICE.didntCatch);
      return;
    }
    side(false);
    try {
      const r = await api.voice(text);
      if (r?.quick) {                                    // answered on the spot ("Cody, take a screenshot"): the shutter, then the word
        caption(t('mascot.voice.you', { text }), false);
        await audio.play('snap');
        speak({ text: String(r.quick.text || ''), show: null, image: r.quick.image ? String(r.quick.image) : null });
        return;
      }
      onState('thinking');
      audio.play('thinking');
      caption(t('mascot.voice.you', { text }), false);
      st.waitUntil = Date.now() + VOICE.wait;
      clearTimeout(st.poll);
      if (st.on) st.poll = setTimeout(poll, VOICE.fast);
    } catch (error) {
      onState(null);
      caption(error?.status === 503 ? t('mascot.voice.noChannel') : String(error?.message || error));
      audio.play('error');
    }
  }

  // while the face is held (continuous, until released) or after a question (a single sentence): this recognition
  // replaces the wake word's, since the two never listen at the same time
  function openMic(continuous = true) {
    if (!Recognizer) { caption(t('mascot.voice.noRecognition')); return; }
    wake.pause();
    audio.silence();
    win.navigator.vibrate?.(25);
    const recognition = new Recognizer();
    recognition.lang = locale();
    recognition.interimResults = true;
    recognition.continuous = continuous;
    st.text = '';
    recognition.onresult = (e) => {
      st.text = joinTranscript(Array.from(e.results));
      if (st.text) { wordArrived(); caption(t('mascot.voice.you', { text: st.text }), false); }
    };
    recognition.onerror = () => {};                      // no microphone or silence: onend sorts it out
    recognition.onend = () => { st.recognition = null; send(st.text); wake.resume(); };
    st.recognition = recognition;
    onState('listening');
    caption(t('mascot.voice.listening'), false);
    startedListening();
    try { recognition.start(); } catch { st.recognition = null; onState(null); wake.resume(); }
  }

  const pressed = () => { clearTimeout(st.hold); st.hold = setTimeout(() => openMic(true), VOICE.hold); };
  const released = () => { clearTimeout(st.hold); st.recognition?.stop(); };
  target.addEventListener('pointerdown', pressed);
  for (const event of ['pointerup', 'pointercancel', 'pointerleave']) target.addEventListener(event, released);
  win.addEventListener?.('pointerdown', () => audio.unlock());   // the browser only plays sound after a tap

  return {
    volume: () => audio.volume(),
    sound: { unlock: () => audio.unlock(), state: () => audio.state() },
    play: (name) => audio.play(name),
    get listening() { return wake.active; },
    announce: ({ text, alert }) => (text ? speak({ text: String(text), alert: String(alert || '') || null }) : st.queue),
    chime: () => audio.chime(),
    playAudio(bytes) {
      st.queue = st.queue.then(async () => {
        wake.pause();
        onState('talking');
        try { await audio.playBytes(bytes); } catch { /* sound still locked, or not an mp3: nothing to hear */ }
        onState(null);
        wake.resume();
      });
      return st.queue;
    },
    listen(on) {
      if (on && Recognizer) wake.start();
      else wake.stop();
      onListening(wake.active);
    },
    start() {
      if (st.on) return;
      st.on = true;
      poll();
      wake.resume();                                     // back to listening for the wake word, if it was on
    },
    stop() {
      st.on = false;
      clearTimeout(st.poll);
      wake.pause();
    },
  };
}
