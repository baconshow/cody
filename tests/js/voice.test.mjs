// Tests for the mascot's voice conversation (web/js/voice.js and its mood in cycle.js): holding listens, releasing
// sends and thinks, the reply is spoken and shown in the caption; a short tap does not listen; a closed channel
// warns; the voice drives the face; a restarted voice session is heard from its first reply; the mascot
// announces timers and heads-up on its own. Plus the wake word, in English and in Portuguese.
// Run with: node --test "tests/js/*.test.mjs"
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoice, VOICE, joinTranscript } from '../../web/js/voice.js';
import { findCommand, createWakeWord } from '../../web/js/wake-word.js';
import { createCycle } from '../../web/js/cycle.js';
import { setLanguage, locale } from '../../web/js/i18n.js';

// the tests run in English, whatever the machine's language is
setLanguage('en', { save: false });

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function scenario({ failWithStatus = null } = {}) {
  const st = { states: [], captions: [], sent: [], spoken: [], replies: [], recognition: null };
  class Recognizer {
    constructor() { st.recognition = this; }
    start() { this.on = true; }
    stop() { this.onend?.(); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const win = {
    SpeechRecognition: Recognizer, SpeechSynthesisUtterance: Utterance, navigator: {},
    speechSynthesis: { getVoices: () => [{ lang: 'en-US' }], cancel() {}, speak: (u) => { st.spoken.push(u); } },
  };
  const api = {
    voice: async (text) => {
      if (failWithStatus) throw Object.assign(new Error('closed'), { status: failWithStatus });
      st.sent.push(text);
      return st.quick ? { request_id: '', quick: st.quick } : { request_id: '1' };
    },
    voiceReplies: async (after) => ({ channel: true, session: st.session, replies: st.replies.filter((r) => r.seq > after) }),
    settings: async () => ({ voice_provider: 'device' }),   // these tests listen to the device's voice (the fake speechSynthesis)
  };
  const target = new EventTarget();
  st.attachments = [];
  st.sides = [];
  const voice = createVoice({
    api, win, target, t: (key, v) => (v?.text ? `${key}:${v.text}` : key),
    onState: (m) => st.states.push(m), onCaption: (text) => st.captions.push(text), onAttachment: (x) => st.attachments.push(x), onSide: (x) => st.sides.push(x),
    onImage: (id) => st.images.push(id),
  });
  st.images = [];
  return { st, voice, target };
}

test('holding listens, releasing sends, the reply is spoken and the face comes back', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice, target } = scenario();
  voice.start();
  await flush();
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  assert.equal(st.states.at(-1), 'listening');
  st.recognition.onresult({ results: [[{ transcript: 'what time' }], [{ transcript: 'is it?' }]] });
  target.dispatchEvent(new Event('pointerup'));
  await flush();
  assert.deepEqual(st.sent, ['what time is it?']);
  assert.equal(st.states.at(-1), 'thinking');
  st.replies = [{ seq: 1, request_id: '1', text: 'Three o\'clock.' }];
  t.mock.timers.tick(VOICE.fast + 1);
  await flush();
  assert.equal(st.spoken.at(-1).text, 'Three o\'clock.');
  assert.equal(st.spoken.at(-1).lang, 'en-US');
  assert.equal(st.spoken.at(-1).lang, locale());
  assert.equal(st.states.at(-1), 'talking');
  assert.equal(st.captions.at(-1), 'Three o\'clock.');
  st.spoken.at(-1).onend();
  await flush();
  assert.equal(st.states.at(-1), null);
  voice.stop();
});

test('a short tap does not open the microphone (it is a pat, not a conversation)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, target } = scenario();
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold - 100);
  target.dispatchEvent(new Event('pointerup'));
  t.mock.timers.tick(VOICE.hold);
  assert.equal(st.recognition, null);
  assert.deepEqual(st.states, []);
});

test('closed channel: asks to start the voice session on the computer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, target } = scenario({ failWithStatus: 503 });
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  st.recognition.onresult({ results: [[{ transcript: 'hi' }]] });
  target.dispatchEvent(new Event('pointerup'));
  await flush();
  assert.equal(st.captions.at(-1), 'mascot.voice.noChannel');
  assert.equal(st.states.at(-1), null);
});

test('the first poll does not speak old replies', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  st.replies = [{ seq: 4, request_id: '3', text: 'an earlier reply' }];
  voice.start();
  await flush();
  assert.deepEqual(st.spoken, []);
  voice.stop();
});

test('the voice drives the face above a pat and the activity', () => {
  const cycle = createCycle();
  cycle.touched(0);
  assert.equal(cycle.mood(0.1), 'happy');
  cycle.setVoice('listening');
  assert.equal(cycle.mood(0.2), 'listening');
  cycle.setVoice(null);
  assert.equal(cycle.mood(0.3), 'happy');
});

test('Chrome on Android repeats the sentence on every piece: the text comes out once', () => {
  const r = (...pieces) => pieces.map((transcript) => [{ transcript }]);
  // what a phone sent for "send a message", spoken once
  const android = r('send', 'send a', 'send a message', 'send a message', 'Send a message');
  assert.equal(joinTranscript(android), 'Send a message');
  // two sentences with a pause: the second also arrives in pieces
  const two = r('open the page', 'open the page', 'and', 'and show', 'and show the logs');
  assert.equal(joinTranscript(two), 'open the page and show the logs');
  // on a computer (without the repetition), each result is a new piece
  assert.equal(joinTranscript(r('how many', 'tests are there')), 'how many tests are there');
  assert.equal(joinTranscript(r('', '  ')), '');
});

test('the wake word in English: "Cody" or "Claude"; the command is what follows', () => {
  assert.deepEqual(findCommand('cody, run the tests'), { woke: true, command: 'run the tests' });
  assert.deepEqual(findCommand('hey Claude open the page'), { woke: true, command: 'open the page' });
  assert.deepEqual(findCommand('Cloud what is the weather like?'), { woke: true, command: 'what is the weather like?' });
  assert.deepEqual(findCommand('Cody'), { woke: true, command: '' });
  assert.deepEqual(findCommand('I will send a message'), { woke: false, command: '' });
  assert.equal(findCommand('co dy').woke, false);
  assert.equal(findCommand('cláudio, roda os testes').woke, false, 'the Portuguese spelling only counts in Portuguese');
});

test('the wake word in Portuguese: "Cody" (or "códi") or "Claude"', () => {
  setLanguage('pt-BR', { save: false });
  try {
    assert.deepEqual(findCommand('Cody, roda os testes'), { woke: true, command: 'roda os testes' });
    assert.deepEqual(findCommand('ô Claude abre a página'), { woke: true, command: 'abre a página' });
    assert.deepEqual(findCommand('Cláudio qual a previsão do tempo?'), { woke: true, command: 'qual a previsão do tempo?' });
    assert.deepEqual(findCommand('códi'), { woke: true, command: '' });
    assert.deepEqual(findCommand('vou mandar uma mensagem'), { woke: false, command: '' });
    assert.equal(findCommand('co di').woke, false);
    assert.equal(locale(), 'pt-BR');
  } finally {
    setLanguage('en', { save: false });
  }
});

test('said only "Cody": it wakes, and the next sentence (even after recognition restarts) is the command', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sessions = [];
  class Recognizer { constructor() { sessions.push(this); } start() {} stop() { this.onend?.(); } abort() {} }
  const st = { woke: 0, commands: [], gaveUp: 0 };
  const wake = createWakeWord({
    Recognizer, onWake: () => st.woke++, onPartial: () => {}, onCommand: (c) => st.commands.push(c), onGiveUp: () => st.gaveUp++,
  });
  wake.start();
  assert.equal(sessions.at(-1).lang, 'en-US');
  const say = (texts, final = true) => sessions.at(-1).onresult({ results: texts.map((x, i) => Object.assign([{ transcript: x }], { isFinal: final && i === texts.length - 1 })) });
  say(['cody']);
  assert.equal(st.woke, 1);
  assert.deepEqual(st.commands, []);
  sessions.at(-1).onend();                                // the silence ended the session; it starts again
  t.mock.timers.tick(400);
  say(['what', 'what is the weather like']);
  assert.deepEqual(st.commands, ['what is the weather like']);
  say(['cody']);
  t.mock.timers.tick(9000);
  assert.equal(st.gaveUp, 1, 'woke up and nobody spoke: gives up');
  wake.stop();
});

test('a link Claude asked to show goes to the box at the bottom, not to the speech', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  voice.start();
  await flush();
  st.replies = [{ seq: 1, request_id: '1', text: 'I sent you the link.', show: 'https://example.test/x' }];
  t.mock.timers.tick(VOICE.slow + 1);
  await flush();
  assert.equal(st.spoken.at(-1).text, 'I sent you the link.');
  assert.equal(st.attachments.at(-1), 'https://example.test/x');
  voice.stop();
});

test('a screenshot Claude took on request goes to the phone with the reply', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  voice.start();
  await flush();
  st.replies = [{ seq: 1, request_id: '1', text: 'The screenshot is on your phone, tap share.', image: 'abc123' }];
  t.mock.timers.tick(VOICE.slow + 1);
  await flush();
  assert.equal(st.spoken.at(-1).text, 'The screenshot is on your phone, tap share.');
  assert.deepEqual(st.images, ['abc123']);
  voice.stop();
});

test('a reply without a screenshot shows none', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  voice.start();
  await flush();
  st.replies = [{ seq: 1, request_id: '1', text: 'Done.' }];
  t.mock.timers.tick(VOICE.slow + 1);
  await flush();
  assert.deepEqual(st.images, []);
  voice.stop();
});

test('soft speech: no word in 2.2 s turns it sideways; a word turns it back; "didn\'t catch that" turns it for a while', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, target } = scenario();
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  t.mock.timers.tick(VOICE.lowVoice + 1);
  assert.equal(st.sides.at(-1), true, 'nobody said anything: it offers its ear');
  st.recognition.onresult({ results: [[{ transcript: 'hi' }]] });
  assert.equal(st.sides.at(-1), false, 'heard something: turns back');
  st.recognition.onresult({ results: [[{ transcript: '' }]] });
  st.text = '';
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  target.dispatchEvent(new Event('pointerup'));            // released without saying anything
  await flush();
  assert.equal(st.captions.at(-1), 'mascot.voice.didntCatch');
  assert.equal(st.sides.at(-1), true);
  t.mock.timers.tick(VOICE.didntCatch + 1);
  assert.equal(st.sides.at(-1), false);
});

test('a permission request: the mascot asks, shows the command and opens the microphone for the "yes"', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  voice.start();
  await flush();
  st.replies = [{ seq: 1, request_id: '', text: 'Can I run a command? Say yes or no.', show: 'pytest -q', permission: 'abcde' }];
  t.mock.timers.tick(VOICE.slow + 1);
  await flush();
  assert.equal(st.attachments.at(-1), 'pytest -q');
  st.recognition = null;
  st.spoken.at(-1).onend();
  await flush();
  assert.ok(st.recognition, 'opened the microphone without holding');
  assert.equal(st.recognition.continuous, false, 'a single sentence');
  st.recognition.onresult({ results: [[{ transcript: 'yes' }]] });
  st.recognition.stop();
  await flush();
  assert.deepEqual(st.sent, ['yes']);
  voice.stop();
});

test('a voice session restarted on the computer is heard from its first reply', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  st.session = 'aaaa1111';
  st.replies = [{ seq: 7, request_id: '7', text: 'an old reply' }];
  voice.start();
  await flush();
  st.session = 'bbbb2222';                       // Claude Code restarted: the count starts over
  st.replies = [{ seq: 1, request_id: '1', text: 'Hello again.' }];
  t.mock.timers.tick(VOICE.slow + 1);
  await flush();
  t.mock.timers.tick(VOICE.fast + 1);
  await flush();
  assert.deepEqual(st.spoken.map((u) => u.text), ['Hello again.']);
  voice.stop();
});

test('an announcement is spoken and captioned, and leaves the link box alone', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice } = scenario();
  voice.announce({ text: "Time's up: pizza.", alert: 'timer:1f2e3d4c' });   // resolves when the speech ends
  await flush();
  assert.equal(st.captions.at(-1), "Time's up: pizza.");
  assert.equal(st.spoken.at(-1).text, "Time's up: pizza.");
  assert.deepEqual(st.attachments, [], 'the link from an earlier reply stays');
  assert.equal(st.states.at(-1), 'talking');
});

test('an alert mood holds above a pat for its seconds, below the voice', () => {
  const cycle = createCycle();
  cycle.touched(0);
  cycle.alert('pointing', 6, 0);
  assert.equal(cycle.mood(1), 'pointing');
  cycle.setVoice('talking');
  assert.equal(cycle.mood(2), 'talking');
  cycle.setVoice(null);
  assert.notEqual(cycle.mood(7), 'pointing');
  cycle.cheer(10);
  assert.equal(cycle.mood(10.5), 'happy');
});

test('"Cody, take a screenshot" is answered on the spot: the picture shows and the word is spoken, no thinking, no poll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice, target } = scenario();
  st.quick = { text: 'Screenshot taken. Tap share to send it.', image: 'q1' };
  voice.start();
  await flush();
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  st.recognition.onresult({ results: [[{ transcript: 'take a screenshot' }]] });
  target.dispatchEvent(new Event('pointerup'));
  await flush();
  assert.deepEqual(st.sent, ['take a screenshot']);
  assert.ok(!st.states.includes('thinking'), 'no round trip through Claude');
  assert.deepEqual(st.images, ['q1']);
  assert.equal(st.spoken.at(-1).text, 'Screenshot taken. Tap share to send it.');
  assert.equal(st.states.at(-1), 'talking');
  voice.stop();
});

test('"how much usage do I have left?" is spoken and the two numbers stay in the box at the bottom', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { st, voice, target } = scenario();
  st.quick = { text: 'Session: 42% used, resets at 10:00. Week: 10% used, resets on Monday at 10:00.', image: null, show: 'session 42% · week 10%' };
  voice.start();
  await flush();
  target.dispatchEvent(new Event('pointerdown'));
  t.mock.timers.tick(VOICE.hold + 1);
  st.recognition.onresult({ results: [[{ transcript: 'how much usage do I have left' }]] });
  target.dispatchEvent(new Event('pointerup'));
  await flush();
  assert.equal(st.attachments.at(-1), 'session 42% · week 10%');
  assert.deepEqual(st.images, [], 'no picture');
  assert.equal(st.spoken.at(-1).text, 'Session: 42% used, resets at 10:00. Week: 10% used, resets on Monday at 10:00.');
  voice.stop();
});
