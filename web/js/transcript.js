// transcript.js — the spoken text from the results of the browser's speech recognition (voice.js and
// wake-word.js).

import { locale } from './i18n.js';

// The spoken text from the recognition results. In Chrome on Android, in continuous mode, each result repeats the
// whole previous one plus a bit more ("send", "send a", "send a message"), sometimes twice: joining them all repeated
// the sentence. Here, a piece that starts with the previous one replaces it, a piece already contained in it is
// ignored, and only what is truly new (another sentence after a pause) is appended.
export function joinTranscript(results) {
  const sentences = [];
  const same = (a) => a.toLocaleLowerCase(locale()).replace(/\s+/g, ' ').trim();
  for (const r of results) {
    const piece = String(r?.[0]?.transcript ?? '').trim();
    if (!piece) continue;
    const last = sentences.length ? same(sentences[sentences.length - 1]) : null;
    const next = same(piece);
    if (last !== null && next.startsWith(last)) sentences[sentences.length - 1] = piece;
    else if (last !== null && last.startsWith(next)) continue;
    else sentences.push(piece);
  }
  return sentences.join(' ').trim();
}
