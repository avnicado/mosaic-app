// Measuring how long a piece takes, for the Promenade's tiles (see src/length.js
// for the estimate used when nothing here can tell).
//
//   lengthFromFeedHtml(html) → a feed that carries the whole text: its words.
//   measurePage(url)         → a page's running time (YouTube, schema.org /
//                              og: durations) or its words in paragraphs.
//   measureMany(items, opts) → the above for a list, a few at a time, inside
//                              a time budget, so the daily collection never
//                              waits on a slow site.
//
// Pages are fetched like the reader fetches them (server/reader.js): public
// addresses only, checked at every redirect, size-capped, short timeouts.
import { assertPublic } from './reader.js';
import { minutesFromWords, isoSeconds } from '../src/length.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 1_500_000;
const MIN_WORDS = 150; // fewer than this in paragraphs: a teaser or a wall, not the piece

const stripTags = (s) => s.replace(/<[^>]*>/g, ' ');
const decode = (s) => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, "'");
const countWords = (text) => (decode(text).match(/[A-Za-zÀ-ÿ0-9’'-]+/g) || []).filter((w) => /[A-Za-zÀ-ÿ]/.test(w)).length;

// The words of an html fragment that sit in paragraphs, list items, quotes
// and headings; navigation and boilerplate rarely do.
export function proseWords(html) {
  let s = String(html || '')
    .replace(/<(script|style|noscript|svg|template|nav|header|footer|aside|form|figure|figcaption|button|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  // The article, when the page marks one; else the main region; else the lot.
  const art = s.match(/<article\b[\s\S]*?<\/article>/gi);
  if (art) s = art.sort((a, b) => b.length - a.length)[0];
  else { const main = /<main\b[\s\S]*?<\/main>/i.exec(s); if (main) s = main[0]; }
  let words = 0;
  for (const m of s.matchAll(/<(p|li|blockquote|h[2-4]|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi)) words += countWords(stripTags(m[2]));
  const images = (s.match(/<img\b/gi) || []).length;
  return { words, images };
}

// A feed item's full text (content:encoded), if that's what the feed gives.
export function lengthFromFeedHtml(html) {
  if (!html || html.length < 1500) return null;
  const words = countWords(stripTags(html));
  if (words < 350) return null; // a summary, not the piece
  const images = (html.match(/<img\b/gi) || []).length;
  return { minutes: minutesFromWords(words, images), length_by: 'feed' };
}

// A running time the page states about itself, in seconds.
export function statedSeconds(html) {
  const yt = /"lengthSeconds"\s*:\s*"(\d+)"/.exec(html);
  if (yt) return +yt[1];
  const iso = /itemprop=["']duration["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*itemprop=["']duration["']|"duration"\s*:\s*"(P[^"]+)"/i.exec(html);
  if (iso) { const s = isoSeconds(iso[1] || iso[2] || iso[3]); if (s) return s; }
  const og = /property=["'](?:og:video:duration|video:duration|music:duration)["'][^>]*content=["'](\d+)["']|content=["'](\d+)["'][^>]*property=["'](?:og:video:duration|video:duration|music:duration)["']/i.exec(html);
  if (og) return +(og[1] || og[2]);
  return null;
}

async function fetchHtml(url, timeoutMs, fetchImpl) {
  let current = url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 5; hop++) {
      await assertPublic(current);
      const res = await fetchImpl(current, {
        redirect: 'manual', signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en;q=0.9' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).href;
        continue;
      }
      if (!res.ok) return null;
      if (!/html|xml/i.test(res.headers.get('content-type') || '')) return null;
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > MAX_BYTES) { ctrl.abort(); break; }
      }
      return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// → { minutes, length_by } or null when the page can't say.
export async function measurePage(url, { timeoutMs = 4000, fetchImpl = fetch } = {}) {
  let html;
  try { html = await fetchHtml(url, timeoutMs, fetchImpl); } catch { return null; }
  if (!html) return null;
  const sec = statedSeconds(html);
  if (sec && sec > 20 && sec < 12 * 3600) return { minutes: Math.max(1, Math.round(sec / 60)), length_by: 'player' };
  const { words, images } = proseWords(html);
  if (words < MIN_WORDS) return null;
  return { minutes: minutesFromWords(words, images), length_by: 'page' };
}

// Measure items that don't have a length yet, a few at a time, until the
// budget runs out. Mutates the items (adds minutes and length_by) and returns
// how many it measured. Never throws.
export async function measureMany(items, { budgetMs = 8000, concurrency = 12, timeoutMs = 4000, fetchImpl = fetch } = {}) {
  const until = Date.now() + budgetMs;
  // A Hacker News discussion page is mostly comments: leave it to the estimate.
  const todo = items.filter((it) => it?.url && !it.minutes && !/^https?:\/\/news\.ycombinator\.com\//.test(it.url));
  let next = 0, measured = 0;
  const worker = async () => {
    while (next < todo.length && Date.now() < until - 500) {
      const it = todo[next++];
      const got = await measurePage(it.url, { timeoutMs: Math.min(timeoutMs, Math.max(500, until - Date.now())), fetchImpl });
      if (got) { it.minutes = got.minutes; it.length_by = got.length_by; measured++; }
    }
  };
  const all = Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  let timer;
  await Promise.race([all, new Promise((r) => { timer = setTimeout(r, budgetMs); })]);
  clearTimeout(timer);
  return measured;
}
