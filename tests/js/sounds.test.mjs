import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { syllables, order, SOUND_NAMES, CHATTER, OUTPUTS } from '../../web/js/sounds.js';

const sounds = new URL('../../web/sounds/', import.meta.url);

test('the outputs fall from the chosen one down to the sounds', () => {
  assert.deepEqual(OUTPUTS, ['elevenlabs', 'hosted', 'device', 'sounds']);
  assert.deepEqual(order('elevenlabs'), OUTPUTS);
  assert.deepEqual(order('device'), ['device', 'sounds']);
  assert.deepEqual(order('sounds'), ['sounds']);
  assert.deepEqual(order('nonsense'), ['device', 'sounds']);
});

test('the chatter follows the text: syllables, pauses, a question goes up', () => {
  const plain = syllables('Done, all good.');
  assert.equal(plain.length, 4);                         // o, a, oo... one per vowel group
  assert.ok(plain[2].gap >= 0.15);                       // the comma
  assert.deepEqual(syllables('Done, all good.'), plain);  // the same text sounds the same
  const asked = syllables('ready?');
  assert.ok(asked.at(-1).rate > syllables('ready').at(-1).rate);
  assert.ok(syllables('a '.repeat(500)).length <= 48);
  for (const s of plain) assert.ok(s.index >= 1 && s.index <= CHATTER);
});

test('every sound file exists, is a small WAV, and the set is complete', () => {
  const names = [...SOUND_NAMES, ...Array.from({ length: CHATTER }, (_, i) => `chatter-${String(i + 1).padStart(2, '0')}`)];
  let total = 0;
  for (const name of names) {
    const url = new URL(`${name}.wav`, sounds);
    assert.ok(existsSync(url), name);
    const bytes = readFileSync(url);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    total += bytes.length;
  }
  assert.ok(total < 400 * 1024, `${total} bytes`);
});
