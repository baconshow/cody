// voice-audio.js — the mascot's voice: the reply's mp3 in the configured ElevenLabs voice (generated on the computer
// by /api/voice/audio; the key never leaves it), played through WebAudio, with the face's mouth following the volume.
// Without it (no voice configured, ElevenLabs down, out of credit), the device's own voice, with the animator's
// make-believe mouth.
//
//   createVoiceAudio({ api, win }) → { unlock(), speak(reply) → Promise, silence(), volume() → 0..1 | null }
//     unlock   on a tap: the browser only plays sound after a gesture (call it on every pointerdown)
//     speak    reply { seq, text }: resolves when it finishes speaking
//     volume   how loud the speech is right now, for animator.hearVoice; null when nobody is speaking through WebAudio

import { locale } from './i18n.js';

export const AUDIO = Object.freeze({ samples: 512, gain: 4, pitch: 1.25, rate: 1.05 });

export function createVoiceAudio({ api, win = window }) {
  const Context = win.AudioContext || win.webkitAudioContext;
  const st = { ctx: null, analyser: null, data: null, source: null };

  function unlock() {
    if (!Context) return;
    st.ctx ??= new Context();
    if (st.ctx.state === 'suspended') st.ctx.resume().catch(() => {});
  }

  function volume() {
    if (!st.source || !st.analyser) return null;
    st.analyser.getByteTimeDomainData(st.data);
    let sum = 0;
    for (const v of st.data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / st.data.length) * AUDIO.gain);
  }

  async function playMp3(bytes) {
    unlock();
    if (!st.ctx) throw new Error('no WebAudio');
    const buffer = await st.ctx.decodeAudioData(bytes);
    if (!st.analyser) {
      st.analyser = st.ctx.createAnalyser();
      st.analyser.fftSize = AUDIO.samples;
      st.data = new Uint8Array(st.analyser.fftSize);
      st.analyser.connect(st.ctx.destination);
    }
    const source = st.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(st.analyser);
    st.source = source;
    await new Promise((done) => { source.onended = done; source.start(); });
    if (st.source === source) st.source = null;
  }

  function speakOnDevice(text) {
    const synth = win.speechSynthesis;
    if (!synth || !win.SpeechSynthesisUtterance) return Promise.resolve();
    return new Promise((done) => {
      const utterance = new win.SpeechSynthesisUtterance(text);
      const lang = locale();
      const prefix = lang.slice(0, 2).toLowerCase();
      utterance.lang = lang;
      utterance.voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix)) ?? null;
      utterance.pitch = AUDIO.pitch;
      utterance.rate = AUDIO.rate;
      utterance.onend = done;
      utterance.onerror = done;
      synth.cancel();
      synth.speak(utterance);
    });
  }

  return {
    unlock,
    volume,
    async speak(reply) {
      try {
        await playMp3(await api.voiceAudio(reply.seq));
      } catch (error) {
        console.info('[cody] the mascot voice did not come; using the device voice', error?.status ?? error?.message);
        await speakOnDevice(String(reply.text || ''));
      }
    },
    silence() {
      try { st.source?.stop(); } catch { /* already stopped */ }
      st.source = null;
      win.speechSynthesis?.cancel();
    },
  };
}
