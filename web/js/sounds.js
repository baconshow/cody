// sounds.js — Cody's own sounds (web/sounds, made by tools/make_sounds.py: no samples, no third-party audio). They
// give Cody a voice with no voice at all: the chatter strings short syllables together in the rhythm of the text
// while the caption shows, and the reactions (done, calling, alarm, pet, startle...) play on their own. Played through
// the same analyser as the spoken replies, so the mouth follows their volume.
//
//   createSounds({ ctx, output, fetchBytes }) → { play(name) → Promise, babble(text) → Promise, stop() }
//   syllables(text, seed) and order(chosen) are pure, for the tests.

export const SOUND_NAMES = Object.freeze(['thinking', 'done', 'error', 'calling', 'alarm', 'hop', 'pet', 'startle',
  'yawn', 'snore']);
export const CHATTER = 12;
export const OUTPUTS = Object.freeze(['elevenlabs', 'hosted', 'device', 'sounds']);
const MAX_SYLLABLES = 48;          // about six seconds: a long reply chatters for a while, not forever

// the outputs to try, from the chosen one down to Cody's sounds, which always work (and are the choice when there
// is none)
export function order(chosen) {
  const at = OUTPUTS.indexOf(chosen);
  return OUTPUTS.slice(at < 0 ? OUTPUTS.indexOf('sounds') : at);
}

// one syllable per vowel group, a pause at spaces and a longer one at punctuation; the same text always sounds the
// same (the pitch comes from the letters)
export function syllables(text) {
  const out = [];
  let gap = 0;
  const groups = String(text).toLowerCase().match(/[aeiouyáéíóúâêôãõàü]+|[.,!?;:…]+|\s+/g) || [];
  for (const g of groups) {
    if (/^\s+$/.test(g)) { gap += 0.05; continue; }
    if (/^[.,!?;:…]+$/.test(g)) { gap += g.includes(',') ? 0.15 : 0.3; continue; }
    const code = [...g].reduce((sum, ch) => sum + ch.codePointAt(0), 0);
    out.push({ gap: Math.min(gap, 0.4), index: (code % CHATTER) + 1, rate: 0.92 + (code % 7) * 0.03 });
    gap = 0.02;
    if (out.length >= MAX_SYLLABLES) break;
  }
  if (/\?\s*$/.test(String(text)) && out.length) out[out.length - 1].rate *= 1.18;   // a question goes up
  return out;
}

export function createSounds({ ctx, output, fetchBytes }) {
  const buffers = new Map();
  const st = { playing: new Set(), stopped: 0 };

  async function buffer(name) {
    if (!buffers.has(name)) {
      buffers.set(name, fetchBytes(`/web/sounds/${name}.wav`).then((bytes) => ctx().decodeAudioData(bytes))
        .catch((e) => { buffers.delete(name); throw e; }));
    }
    return buffers.get(name);
  }

  function start(audio, at, rate = 1) {
    const source = ctx().createBufferSource();
    source.buffer = audio;
    source.playbackRate.value = rate;
    source.connect(output());
    st.playing.add(source);
    source.onended = () => st.playing.delete(source);
    source.start(at);
    return source;
  }

  async function play(name) {
    if (!ctx()) return;
    const audio = await buffer(name);
    await new Promise((done) => { start(audio, 0).addEventListener('ended', done); });
  }

  async function babble(text) {
    if (!ctx()) return;
    const run = ++st.stopped;
    const plan = syllables(text);
    const audios = await Promise.all(plan.map((s) => buffer(`chatter-${String(s.index).padStart(2, '0')}`)));
    if (run !== st.stopped) return;
    let at = ctx().currentTime + 0.05;
    let last = null;
    plan.forEach((s, i) => {
      at += s.gap;
      last = start(audios[i], at, s.rate);
      at += audios[i].duration / s.rate;
    });
    if (last) await new Promise((done) => last.addEventListener('ended', done));
  }

  function stop() {
    st.stopped += 1;
    for (const source of st.playing) { try { source.stop(); } catch { /* already stopped */ } }
    st.playing.clear();
  }

  return { play, babble, stop };
}
