// The skins (web/js/skins.js, web/skins/skins.json): data like the scenes, the classic one first, worn pieces that
// scenes3d.js can draw, and the viewer's choice kept on this screen only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSkins, skinScene, skinNamed, skinName, readSkin, saveSkin, CLASSIC, SKIN_KEY } from '../../web/js/skins.js';

const data = JSON.parse(readFileSync(new URL('../../web/skins/skins.json', import.meta.url)));
const skins = validSkins(data);

test('the shop has the classic skin first and the Halloween one, both free', () => {
  assert.deepEqual(skins.map((s) => s.id), ['classic', 'halloween']);
  for (const s of skins) assert.equal(s.price, 0, 'no real charge until Cody has a character of its own');
  assert.equal(skinName(skins[1], 'pt-BR'), 'Cody Abóbora');
  assert.equal(skinName(skins[1], 'fr'), "Jack-o'-Cody", 'English when the language has no name');
});

test('the Halloween skin is a pumpkin: new plastic, the ^ eyes, its own glowing mouth, a witch hat on the body', () => {
  const skin = skinNamed(skins, 'halloween');
  assert.deepEqual(Object.keys(skin.colors).sort(), ['body', 'leg']);
  assert.equal(skin.smile, true);
  assert.equal(skin.mouth, false, 'the talking mouth stays hidden: the zigzag is the mouth');
  const scene = skinScene(skin);
  assert.equal(scene.id, 'skin:halloween');
  assert.ok(scene.parts.every((p) => p.on === 'body'), 'everything a skin adds is worn');
  assert.ok(scene.parts.some((p) => p.glow), 'the mouth glows');
  for (const p of scene.parts) for (const b of p.boxes) assert.equal(b.length, 6);
  assert.equal(skinScene(skins[0]), null, 'the classic skin adds nothing');
});

test('broken entries are dropped and a missing classic is made up', () => {
  const list = validSkins({ skins: [
    { id: 'x', name: { en: 'X' }, colors: { body: 'red', leg: '#123456', hat: '#000000' }, parts: [{ boxes: [[1, 2, 3]] }, { boxes: [[0, 0, 0, 1, 1, 1]], color: 'blue' }, { boxes: [[0, 0, 0, 1, 1, 1]] }] },
    { id: 'Bad Id', name: { en: 'no' } }, { id: 'noname' }, null,
  ] });
  assert.deepEqual(list.map((s) => s.id), ['classic', 'x']);
  assert.deepEqual(list[1].colors, { leg: '#123456' }, 'only known keys with hex colors');
  assert.equal(list[1].parts.length, 1, 'a part needs six-number boxes and a hex color, if any');
  assert.equal(validSkins(null).length, 1);
});

test('the viewer\'s choice lives in localStorage; the classic one clears it', () => {
  const store = new Map();
  const win = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  assert.equal(readSkin(win), null);
  saveSkin(win, 'halloween');
  assert.equal(store.get(SKIN_KEY), 'halloween');
  assert.equal(readSkin(win), 'halloween');
  saveSkin(win, CLASSIC);
  assert.equal(readSkin(win), null);
  assert.equal(readSkin({ get localStorage() { throw new Error('blocked'); } }), null, 'no storage: no choice, no crash');
});
