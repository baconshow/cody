// The skins (web/js/skins.js, web/skins/skins.json): data like the scenes, the classic one first, worn pieces that
// scenes3d.js can draw, and the viewer's choice kept on this screen only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSkins, skinScene, skinNamed, skinName, readSkin, saveSkin, CLASSIC, SKIN_KEY } from '../../web/js/skins.js';

const data = JSON.parse(readFileSync(new URL('../../web/skins/skins.json', import.meta.url)));
const skins = validSkins(data);

test('the shop has the classic skin first and the Halloween one, both free', () => {
  assert.deepEqual(skins.map((s) => s.id), ['classic', 'halloween', 'aviator', 'pixel', 'boss']);
  for (const s of skins) assert.equal(s.price, 0, 'no real charge until Cody has a character of its own');
  assert.equal(skinName(skins[1], 'pt-BR'), 'Cody Abóbora');
  assert.equal(skinName(skins[1], 'fr'), "Jack-o'-Cody", 'English when the language has no name');
});

test('the Halloween skin is a real pumpkin: a ribbed gourd, its own stem, a mouth carved through and a witch hat of shapes', () => {
  const skin = skinNamed(skins, 'halloween');
  assert.deepEqual(Object.keys(skin.colors).sort(), ['body', 'leg']);
  assert.equal(skin.smile, true);
  assert.equal(skin.mouth, false, 'the talking mouth stays hidden: the carved grin is the mouth');
  assert.equal(skin.body.form, 'gourd');
  assert.deepEqual(skin.body.crown, [-3, 1], 'the ribs meet where the sprout grows');
  assert.deepEqual(skin.sprout.shapes.map((s) => s.kind), ['tube', 'tube'], 'a stem and a tendril instead of the leaves');
  assert.ok(skin.sprout.shapes[0].ridges > 0, 'the stem is ridged');
  assert.ok(skin.carve.outline.length >= 12, 'a grin with teeth');
  assert.equal(skin.carve.glow.length, 2);
  assert.ok(skin.legs < 5 && skin.legs >= 2, 'it stands lower: a round belly shows more leg');
  assert.ok(skin.sprout.shapes[0].sway === 0 && skin.sprout.shapes[1].sway > 0, 'the stem stands still, the tendril waves a little');
  const scene = skinScene(skin);
  assert.equal(scene.id, 'skin:halloween');
  assert.ok(scene.parts.every((p) => p.on === 'body'), 'everything a skin adds is worn');
  assert.deepEqual(scene.parts[0].shapes.map((s) => s.kind), ['lathe', 'tube', 'plate'], 'the hat: a brim, a bent cone, a buckle');
  assert.equal(scene.parts[0].shapes[1].bands.length, 1, 'with its band');
  assert.deepEqual(scene.parts[0].boxes, [], 'no voxel boxes left in it');
  assert.equal(skinScene(skins[0]), null, 'the classic skin adds nothing');
  assert.deepEqual([skins[0].body, skins[0].sprout, skins[0].carve, skins[0].legs], [null, null, null, 5], 'and changes nothing of the figure');
});

test('broken entries are dropped and a missing classic is made up', () => {
  const list = validSkins({ skins: [
    { id: 'x', name: { en: 'X' }, colors: { body: 'red', leg: '#123456', hat: '#000000' }, parts: [{ boxes: [[1, 2, 3]] }, { boxes: [[0, 0, 0, 1, 1, 1]], color: 'blue' }, { boxes: [[0, 0, 0, 1, 1, 1]] }] },
    { id: 'Bad Id', name: { en: 'no' } }, { id: 'noname' }, null,
  ] });
  assert.deepEqual(list.map((s) => s.id), ['classic', 'x']);
  assert.deepEqual(list[1].colors, { leg: '#123456' }, 'only known keys with hex colors');
  assert.equal(list[1].parts.length, 1, 'a part needs six-number boxes and a hex color, if any');
  const shaped = validSkins({ skins: [{ id: 'y', name: { en: 'Y' }, body: { form: 'cube' }, sprout: { shapes: [{ kind: 'blob' }] }, carve: { outline: [] },
    parts: [{ shapes: [{ kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 1 }, { kind: 'blob' }] }, { shapes: [{ kind: 'blob' }] }, {}, { boxes: 'no' }] }] })[1];
  assert.equal(shaped.parts.length, 1, 'a part of shapes alone is a part; one with nothing to build is not');
  assert.deepEqual([shaped.parts[0].shapes.length, shaped.parts[0].boxes], [1, []], 'the shape that cannot be built is left out');
  assert.deepEqual([shaped.body, shaped.sprout, shaped.carve], [null, null, null], 'an unknown body, an empty stem and an empty mouth are no change');
  assert.deepEqual(validSkins({ skins: [{ id: 'a', name: { en: 'A' }, legs: 0 }, { id: 'b', name: { en: 'B' }, legs: 40 }, { id: 'c', name: { en: 'C' }, legs: 'x' }] })
    .slice(1).map((s) => s.legs), [2, 5, 5], 'legs stay between stubs and the height the figure has');
  const stem = validSkins({ skins: [{ id: 'z', name: { en: 'Z' }, sprout: { color: '#00ff00', finish: 'matte', shapes: [{ kind: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: 1 }] } }] })[1].sprout;
  assert.deepEqual([stem.color, stem.finish, stem.shapes.length], ['#00ff00', 'matte', 1]);
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

test('three looks from the printed figures: the aviator, the pixel one and the boss, all worn on the body', () => {
  const byId = Object.fromEntries(skins.map((s) => [s.id, s]));
  for (const id of ['aviator', 'pixel', 'boss']) {
    assert.ok(byId[id], id);
    assert.equal(byId[id].price, 0);
    assert.ok(byId[id].name.en && byId[id].name['pt-BR'], `${id} is named in both languages`);
    assert.ok(byId[id].parts.length >= 3 && byId[id].parts.every((p) => p.on === 'body'), `${id} wears its pieces`);
    assert.ok(skinScene(byId[id]), `${id} has pieces to build`);
  }
  assert.equal(byId.aviator.mouth, false, 'the aviator grins with its own teeth');
  assert.equal(byId.boss.mouth, true);
});
