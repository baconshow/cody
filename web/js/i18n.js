// i18n.js — the UI texts in two languages: English, the default, and Brazilian Portuguese (strings.js). What Claude
// says comes through as it was written and never passes through here.
//
// The language comes from ?lang= for this visit; otherwise from the saved choice (kept in the browser); otherwise
// from the browser's own languages. Switching live: elements with data-t* are rewritten on the spot, and code that
// builds text in JavaScript listens to onLanguageChange and redraws.
//
//   t(key, vars)          the text in the current language; {name} becomes vars.name; a { one, other } value
//                         picks by vars.n
//   language()            'en' | 'pt-BR'
//   setLanguage(v, { save })   switches, rewrites the page and notifies the listeners
//   onLanguageChange(fn)  fn(language) on every switch; returns the unsubscribe function
//   translate(root)       rewrites data-t (text), data-t-title, data-t-aria and data-t-ph (placeholder) under root
//   locale()              'en-US' | 'pt-BR': speech recognition, the device voice, numbers and dates
// Attributes: data-t="key" on an element whose text is only that; the other three for title, aria-label and
// placeholder.

import { en, pt } from './strings.js';

const TEXTS = Object.freeze({ en: Object.freeze({ ...en }), 'pt-BR': Object.freeze({ ...pt }) });

export const LANGUAGES = Object.freeze(['en', 'pt-BR']);
const SAVED = 'cody:language';
const listeners = new Set();

const valid = (v) => (LANGUAGES.includes(v) ? v : null);
function readSaved() {
  try { return valid(localStorage.getItem(SAVED)); } catch { return null; }
}
function fromBrowser() {
  const wanted = typeof navigator !== 'undefined' ? [...(navigator.languages || []), navigator.language] : [];
  return wanted.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('pt')) ? 'pt-BR' : 'en';
}
function initial() {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  return valid(q.get('lang')) || readSaved() || fromBrowser();
}

let current = initial();
export const language = () => current;
export const locale = () => (current === 'pt-BR' ? 'pt-BR' : 'en-US');

export function t(key, vars = {}) {
  let v = TEXTS[current]?.[key] ?? TEXTS.en[key];
  if (v === undefined) return key;
  if (v && typeof v === 'object' && !Array.isArray(v)) v = Number(vars.n) === 1 ? v.one : v.other;
  if (typeof v !== 'string') return v;
  return v.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

const ATTRIBUTES = Object.freeze([['tTitle', 'title'], ['tAria', 'aria-label'], ['tPh', 'placeholder']]);

export function translate(root = typeof document !== 'undefined' ? document : null) {
  if (!root?.querySelectorAll) return;
  for (const e of root.querySelectorAll('[data-t]')) {
    const text = t(e.dataset.t);
    if (e.textContent !== text) e.textContent = text;
  }
  for (const [data, attribute] of ATTRIBUTES) {
    for (const e of root.querySelectorAll(`[data-${data.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) {
      e.setAttribute(attribute, t(e.dataset[data]));
    }
  }
}

export function setLanguage(v, { save = true } = {}) {
  const next = valid(v);
  if (!next || next === current) return;
  current = next;
  if (save) { try { localStorage.setItem(SAVED, next); } catch { /* no storage: this visit only */ } }
  if (typeof document !== 'undefined') { document.documentElement.lang = next; translate(document); }
  for (const fn of listeners) { try { fn(next); } catch (e) { console.warn('[cody] language listener failed', e); } }
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof document !== 'undefined') document.documentElement.lang = current;
