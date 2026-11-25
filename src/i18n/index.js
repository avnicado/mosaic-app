// Interface language. English is the default and the source text: every
// translatable string is written in English at its call site and passed to
// t(), which looks it up in the active language's dictionary and falls back
// to the English when there is no entry. So English output is unchanged, and
// a missing translation shows English rather than a key.
//
//   t('New thread')                       → "שרשור חדש"
//   t('Ends {date}', { date })            → placeholders in {braces}
//   t('{a} of {b}', { a: <b>1</b>, b })   → React nodes allowed; returns a fragment
//   tp(n, '{n} thread', '{n} threads')    → picks the form by English rules, then translates
//   t('Kept#heading')                     → "#context" tells apart one English word with two
//                                            meanings; it is dropped from the English
//
// The choice is stored under "m2:lang", so it follows the person to every
// device they sign in from (sync.js mirrors m2:* keys). Hebrew turns the
// document right to left. `npm run i18n-check` lists strings with no Hebrew.

import React, { useSyncExternalStore } from 'react';
import he from './he/index.js';
import { setContentLang } from '../engine/lang.js';

const KEY = 'm2:lang'; // synced: follows the person
const DEVICE_KEY = 'mosaic:lang'; // not synced: keeps sign-in screens in the last language after sign-out
export const LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr', locale: 'en' },
  { code: 'he', name: 'עברית', dir: 'rtl', locale: 'he-IL' },
];
const DICTS = { he };
const byCode = (c) => LANGUAGES.find((l) => l.code === c);

function readStored() {
  try {
    for (const k of [KEY, DEVICE_KEY]) { const v = localStorage.getItem(k); if (byCode(v)) return v; }
  } catch {}
  return 'en';
}

let lang = typeof window === 'undefined' ? 'en' : readStored();
setContentLang(lang);
const listeners = new Set();

export const getLang = () => lang;
export const isRtl = () => byCode(lang).dir === 'rtl';
/** Locale for Intl / toLocale*: undefined in English keeps the browser's own, as before. */
export const loc = () => (lang === 'en' ? undefined : byCode(lang).locale);

export function setLang(code) {
  if (!byCode(code) || code === lang) return;
  lang = code;
  try { localStorage.setItem(KEY, code); localStorage.setItem(DEVICE_KEY, code); } catch {}
  applyDocument();
  listeners.forEach((f) => f());
}

/** Re-read the stored choice (after sync has pulled the person's record in). */
export function reloadLang() {
  const v = readStored();
  if (v !== lang) { lang = v; listeners.forEach((f) => f()); }
  applyDocument();
}

function subscribe(f) { listeners.add(f); return () => listeners.delete(f); }
export const useLang = () => useSyncExternalStore(subscribe, getLang, () => 'en');

const HEBREW_FONTS = 'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@300..700&family=Heebo:wght@300..700&display=swap';

/** Sets <html lang dir> and, for Hebrew, loads the Hebrew faces that back up the Latin ones. */
export function applyDocument() {
  setContentLang(lang); // what Mosaic searches for and writes in (src/engine/lang.js)
  if (typeof document === 'undefined') return;
  const l = byCode(lang);
  const root = document.documentElement;
  root.lang = l.code;
  root.dir = l.dir;
  if (l.code === 'he' && !document.getElementById('fonts-he')) {
    const link = document.createElement('link');
    link.id = 'fonts-he'; link.rel = 'stylesheet'; link.href = HEBREW_FONTS;
    document.head.appendChild(link);
  }
}

// If another device changes the language and sync pulls it in, follow along.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) reloadLang(); });
}

const missing = new Set();
const plain = (key) => { const i = key.indexOf('#'); return i > 0 ? key.slice(0, i) : key; };
function lookup(en) {
  if (typeof en !== 'string') return en;
  if (lang === 'en') return plain(en);
  const s = DICTS[lang]?.[en];
  if (s != null) return s;
  if (import.meta.env?.DEV && !missing.has(en)) { missing.add(en); console.warn(`[i18n] no ${lang} for: ${JSON.stringify(en)}`); }
  return plain(en);
}

function fill(s, vars) {
  if (!vars) return s;
  const parts = s.split(/(\{[a-zA-Z0-9_]+\})/);
  let nodes = false;
  const out = parts.map((p) => {
    const m = /^\{([a-zA-Z0-9_]+)\}$/.exec(p);
    if (!m || !(m[1] in vars)) return p;
    const v = vars[m[1]];
    if (v != null && typeof v === 'object') nodes = true;
    return v;
  });
  if (!nodes) return out.map((v) => (v == null ? '' : String(v))).join('');
  return React.createElement(React.Fragment, null, ...out.filter((v) => v !== ''));
}

/** Translate an English string. vars fill {placeholders}; values may be React nodes. */
export function t(en, vars) { return fill(lookup(en), vars); }

/** Plural: English picks the form (n === 1 → one), then it is translated. {n} is filled with n. */
export function tp(n, one, many, vars) { return t(n === 1 ? one : many, { n, ...vars }); }
