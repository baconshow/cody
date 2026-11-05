// voice-audio.js — the mascot's voice, with four outputs tried in order from the one chosen in Settings (sounds.js
// order()): ElevenLabs (the reply's mp3, made on the computer by /api/voice/audio; the key never leaves it), Cody's
// hosted voice (not offered yet), the device's own voice, and Cody's sounds, which always work. When one fails the
// next one speaks and onFallback({ from, to, reason }) lets the page say so. WebAudio output goes through an analyser,
// so the face's mouth follows the volume.
//
//   createVoiceAudio({ api, win, onFallback }) → { unlock(), state(), speak(reply) → Promise, play(name), chime(),
//                                                  silence(), volume() → 0..1 | null }
//     unlock   on a tap: the browser only plays sound after a gesture (call it on every pointerdown)
//     speak    reply { seq, text } or an alert { alert, text } (a timer ringing, a heads-up: /api/voice/alert):
//              resolves when it finishes speaking
//     chime    two short beeps, for a timer that is ringing
//     volume   how loud the speech is right now, for animator.hearVoice; null when nobody is speaking through WebAudio

import { locale } from './i18n.js';
import { createSounds, order } from './sounds.js';

export const AUDIO = Object.freeze({ samples: 512, gain: 4, pitch: 1.25, rate: 1.05 });
const CHIME = Object.freeze({ notes: [880, 1175], length: 0.14, gap: 0.06, volume: 0.25 });

const PROVIDER_TTL_MS = 60000;

export function createVoiceAudio({ api, win = window, onFallback = () => {} }) {
  const Context = win.AudioContext || win.webkitAudioContext;
  const st = { ctx: null, analyser: null, data: null, source: null, talking: false, provider: null, asked: 0 };

  function output() {
    if (!st.analyser) {
      st.analyser = st.ctx.createAnalyser();
      st.analyser.fftSize = AUDIO.samples;
      st.data = new Uint8Array(st.analyser.fftSize);
      st.analyser.connect(st.ctx.destination);
    }
    return st.analyser;
  }
  const fetchBytes = async (path) => {
    const resp = await win.fetch(path, { cache: 'force-cache' });
    if (!resp.ok) throw new Error(`sound ${resp.status}`);
    return resp.arrayBuffer();
  };
  const sounds = createSounds({ ctx: () => { unlock(); return st.ctx; }, output, fetchBytes });

  function unlock() {
    if (!Context) return;
    st.ctx ??= new Context();
    if (st.ctx.state === 'suspended') st.ctx.resume().catch(() => {});
  }

  function volume() {
    if (!(st.source || st.talking) || !st.analyser) return null;
    st.analyser.getByteTimeDomainData(st.data);
    let sum = 0;
    for (const v of st.data) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / st.data.length) * AUDIO.gain);
  }

  async function playMp3(bytes) {
    unlock();
    if (!st.ctx) throw new Error('no WebAudio');
    const buffer = await st.ctx.decodeAudioData(bytes);
    const source = st.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(output());
    st.source = source;
    await new Promise((done) => { source.onended = done; source.start(); });
    if (st.source === source) st.source = null;
  }

  function speakOnDevice(text) {
    const synth = win.speechSynthesis;
    if (!synth || !win.SpeechSynthesisUtterance) return Promise.resolve(false);
    return new Promise((done) => {
      const utterance = new win.SpeechSynthesisUtterance(text);
      const lang = locale();
      const prefix = lang.slice(0, 2).toLowerCase();
      utterance.lang = lang;
      utterance.voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix)) ?? null;
      utterance.pitch = AUDIO.pitch;
      utterance.rate = AUDIO.rate;
      utterance.onend = () => done(true);
      utterance.onerror = (e) => done(e?.error === 'interrupted' || e?.error === 'canceled');
      synth.cancel();
      synth.speak(utterance);
    });
  }

  function chime() {
    if (!st.ctx || st.ctx.state !== 'running') return;
    let at = st.ctx.currentTime;
    for (const frequency of CHIME.notes) {
      const tone = st.ctx.createOscillator();
      const level = st.ctx.createGain();
      tone.frequency.value = frequency;
      level.gain.setValueAtTime(CHIME.volume, at);
      level.gain.exponentialRampToValueAtTime(0.001, at + CHIME.length);
      tone.connect(level).connect(st.ctx.destination);
      tone.start(at);
      tone.stop(at + CHIME.length);
      at += CHIME.length + CHIME.gap;
    }
  }

  // the chosen output, from Settings (asked again every minute, so a change there is heard soon)
  async function provider() {
    if (!st.provider || Date.now() - st.asked > PROVIDER_TTL_MS) {
      st.asked = Date.now();
      try { st.provider = (await api.settings()).voice_provider; } catch { st.provider ??= 'device'; }
    }
    return st.provider;
  }

  const OUTPUT = {
    async elevenlabs(reply) {
      if (!reply.alert && reply.seq === undefined) return false;
      await playMp3(await (reply.alert ? api.voiceAlert(reply.alert) : api.voiceAudio(reply.seq)));
      return true;
    },
    hosted: async () => false,                        // Cody's hosted voice is not offered yet
    device: (reply) => speakOnDevice(String(reply.text || '')),
    async sounds(reply) {
      unlock();
      if (!st.ctx) return false;
      st.talking = true;
      try { await sounds.babble(String(reply.text || '')); } finally { st.talking = false; }
      return true;
    },
  };

  return {
    unlock,
    state: () => st.ctx?.state ?? (Context ? 'suspended' : null),
    volume,
    chime,
    async speak(reply) {
      const chain = order(await provider());
      let reason = null;
      for (const out of chain) {
        let spoken = false;
        try { spoken = await OUTPUT[out](reply); } catch (error) { reason = error?.message || String(error); }
        if (spoken) {
          if (out !== chain[0]) onFallback({ from: chain[0], to: out, reason });
          return;
        }
      }
    },
    play: (name) => (name ? sounds.play(name).catch(() => {}) : Promise.resolve()),
    silence() {
      sounds.stop();
      try { st.source?.stop(); } catch { /* already stopped */ }
      st.source = null;
      win.speechSynthesis?.cancel();
    },
  };
}
