// The language Mosaic finds and writes in. The interface sets it (src/i18n);
// it stays English otherwise, so Node smoke tests and English mode behave
// exactly as before.
//
// In Hebrew, searches look for Hebrew works first and fall back to English
// when Hebrew finds too few, and the prose the model writes for the reader
// (readings, previews, whys, a quest guide's replies) is written in Hebrew.
// Stored values the code compares against (registers, slots, fields, topics,
// media types, verdicts) stay in English.

let current = 'en';

export function setContentLang(code) { current = code === 'he' ? 'he' : 'en'; }
export const contentLang = () => current;
export const inHebrew = () => current === 'he';

const HEBREW_LETTER = /[א-ת]/;
const HEBREW_LETTERS = /[א-ת]/g;
const LATIN_LETTERS = /[A-Za-z]/g;

// Is this text written in Hebrew? Mostly Hebrew letters, so an English title
// with one Hebrew word in it doesn't count.
export function isHebrew(text) {
  const s = String(text || '');
  if (!HEBREW_LETTER.test(s)) return false;
  const he = (s.match(HEBREW_LETTERS) || []).length;
  const en = (s.match(LATIN_LETTERS) || []).length;
  return he >= en;
}

// A search result or a pool item written in Hebrew (judged by its title, or
// by the start of its snippet when the title says nothing either way).
export const isHebrewItem = (it) => isHebrew(it?.title) || (!/[A-Za-z]/.test(it?.title || '') && isHebrew(String(it?.snippet || it?.excerpt || '').slice(0, 160)));

// Lines added to prompts in Hebrew mode only (empty in English, so English
// prompts are unchanged).
export const HEBREW_PROSE = 'Write the prose meant for the reader in natural, modern Hebrew, as a good Israeli writer would, addressing the reader without gender (no masculine-only "you"). Keep titles of works in their own language, keep names as the source spells them, and keep every value the format lists as a fixed choice (and every topic tag) exactly as specified, in English.';
export const hebrewProse = (what) => (inHebrew() ? `\n\nLanguage: ${what ? `write ${what} in Hebrew. ` : ''}${HEBREW_PROSE}` : '');
