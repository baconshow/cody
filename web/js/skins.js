// skins.js — the skins of the mascot. A skin is data (web/skins/skins.json): new colors for the figure's plastic
// (colors: body, leg, eye, mouth, stem, leaf...), extra pieces it wears (parts, exactly like a scene's worn parts:
// boxes in voxels, on the body, a pivot, a color, maybe a glow) and two looks (smile: the ^ eyes always on;
// mouth: false hides the talking mouth, the skin draws its own). The shop lists them; wearing one costs nothing
// while Cody is Cody (a paid skin comes only with a character of Cody's own). Pure logic, run in Node by the tests.
//
//   validSkins(data) → skins (the classic one first)
//   skinScene(skin) → { id: 'skin:<id>', parts } the skin's pieces as a scene for scenes3d.js (null without any)
//   skinNamed(skins, id) → skin | null
//   readSkin(win) / saveSkin(win, id): the viewer's choice, in localStorage (each screen picks its own)

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_KEYS = new Set(['body', 'leg', 'eye', 'glint', 'blush', 'mouth', 'stem', 'leaf']);
export const CLASSIC = 'classic';
export const SKIN_KEY = 'cody.skin';

function cleanColors(colors) {
  const out = {};
  for (const [k, v] of Object.entries(colors || {})) if (COLOR_KEYS.has(k) && HEX.test(String(v))) out[k] = String(v);
  return out;
}

function validPart(part) {
  if (!part || typeof part !== 'object' || !Array.isArray(part.boxes)) return false;
  return part.boxes.every((b) => Array.isArray(b) && b.length === 6 && b.every(Number.isFinite))
    && (!part.color || HEX.test(String(part.color))) && (!part.glow || HEX.test(String(part.glow)));
}

export function validSkins(data) {
  const list = Array.isArray(data?.skins) ? data.skins : [];
  const skins = list
    .filter((s) => s && typeof s.id === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(s.id) && s.name && typeof s.name === 'object')
    .map((s) => ({
      id: s.id,
      name: s.name,
      colors: cleanColors(s.colors),
      parts: (Array.isArray(s.parts) ? s.parts : []).filter(validPart).map((p) => ({ ...p, on: 'body' })),
      smile: s.smile === true,
      mouth: s.mouth !== false,
      price: Number.isFinite(s.price) ? s.price : 0,
    }));
  const classic = skins.find((s) => s.id === CLASSIC) || { id: CLASSIC, name: { en: 'Classic' }, colors: {}, parts: [], smile: false, mouth: true, price: 0 };
  return [classic, ...skins.filter((s) => s.id !== CLASSIC)];
}

export const skinScene = (skin) => (skin?.parts?.length ? { id: `skin:${skin.id}`, parts: skin.parts } : null);

export const skinNamed = (skins, id) => skins.find((s) => s.id === id) ?? null;

export const skinName = (skin, language) => String(skin?.name?.[language] || skin?.name?.en || skin?.id || '');

export function readSkin(win = globalThis) {
  try { return win.localStorage?.getItem(SKIN_KEY) || null; } catch { return null; }
}

export function saveSkin(win, id) {
  try {
    if (id && id !== CLASSIC) win.localStorage?.setItem(SKIN_KEY, id);
    else win.localStorage?.removeItem(SKIN_KEY);
  } catch { /* no storage: this visit only */ }
}
