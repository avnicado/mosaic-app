// How long a piece takes, in minutes. The Promenade's tiles are sized by it.
//
// The daily collection measures what it can (server/length.js): a feed that
// carries the whole text, a page's own words, a player's running time. That
// comes with length_by 'feed' | 'page' | 'player'. Anything it couldn't
// measure (or a pool collected before lengths existed) gets an estimate here,
// from what kind of thing it is and where it comes from, marked
// length_by 'estimate' so a card can say "about".
import { normalizeMediaType } from './media.js';

export const WPM = 230;

// Typical lengths by kind, in minutes.
const BY_TYPE = {
  article: 8, essay: 15, paper: 30, book: 60, reference: 10,
  video: 15, lecture: 50, film: 90, podcast: 50, interview: 45, music: 4,
  art: 3, forum: 10, web: 8,
};
// What the collection's own sources usually run to.
const BY_SOURCE = {
  'Aeon': 20, 'Quanta Magazine': 14, 'Nautilus': 13, 'Colossal': 3, 'Atlas Obscura': 6,
  'ProPublica': 16, 'Ars Technica Science': 6, 'Smithsonian': 9,
};

export const minutesFromWords = (words, images = 0) =>
  Math.max(1, Math.round(words / WPM + (Math.min(20, images) * 8) / 60));

// ISO 8601 duration ("PT1H2M3S") → seconds, or null.
export function isoSeconds(s) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(String(s || '').trim());
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [, d, h, mi, se] = m;
  return (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+se || 0);
}

export function kindOf(item) {
  const url = item?.url || '';
  if (/aeon\.co\/videos\//.test(url)) return 'video';
  if (/psyche\.co\/films\//.test(url)) return 'video';
  if (/\.pdf($|\?)/i.test(url)) return 'paper';
  if (/news\.ycombinator\.com\/item/.test(url)) return 'forum';
  return normalizeMediaType(item?.mediaType, url);
}

export function estimateMinutes(item) {
  const kind = kindOf(item);
  if (kind === 'article' && BY_SOURCE[item?.source]) return BY_SOURCE[item.source];
  return BY_TYPE[kind] || 8;
}

const valid = (m) => Number.isFinite(m) && m > 0 && m < 24 * 60;

// → item with { minutes, length_by } filled in when missing. Doesn't touch a
// measured length.
export function withLength(item) {
  if (valid(item?.minutes) && item.length_by) return item;
  if (valid(item?.minutes)) return { ...item, minutes: Math.round(item.minutes), length_by: 'page' };
  return { ...item, minutes: estimateMinutes(item), length_by: 'estimate' };
}

export function fmtMinutes(m) {
  if (!valid(m)) return '';
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60), mm = r % 60;
  return `${h} hr${mm ? ` ${mm} min` : ''}`;
}
export const shortMinutes = (m) => (m < 60 ? `${Math.round(m)}′` : `${(m / 60).toFixed(1).replace('.0', '')}h`);
// "12 min", or "about 15 min" when it's an estimate.
export const lengthText = (item) => (valid(item?.minutes)
  ? `${item.length_by === 'estimate' ? 'about ' : ''}${fmtMinutes(item.minutes)}` : '');
