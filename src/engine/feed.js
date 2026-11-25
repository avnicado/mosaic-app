// Filling the four slots. Rule carried over from the demo: MODELS NEVER
// PRODUCE URLS. Primary path is retrieve→select — the model writes a search
// query, a real search API (/api/search → Tavily) returns real results, and a
// second call picks one; a pick whose URL isn't in the results is rejected.
// Fallback: a knowledge tier gated in code to English-Wikipedia article URLs
// (and Hebrew Wikipedia in Hebrew mode).
// In Hebrew mode (src/engine/lang.js) each slot first searches in Hebrew for a
// work written in Hebrew, and falls back to the English search below when the
// Hebrew results are too few or none fits.
// Every accepted item passes a liveness check (/api/checkurl).

import { callLLM, parseJSON, apiFetch, sleep, suggestedWaitMs } from './llm.js';
import { SLOTS, clip, searchQueryPrompt, selectFromResultsPrompt, knowledgePrompt } from './prompts.js';
import { normalizeMediaType, normalizeField, normalizeTopics } from '../media.js';
import { inHebrew, isHebrewItem } from './lang.js';

const TIMEOUT_MS = 120000;
const WIKI_RE = /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s#?]+$/;
const WIKI_HE_RE = /^https:\/\/he\.wikipedia\.org\/wiki\/[^\s#?]+$/;
const wikiOk = (url) => WIKI_RE.test(url) || (inHebrew() && WIKI_HE_RE.test(url));
// Hebrew results needed before the Hebrew search is worth a selection call.
const HEBREW_ENOUGH = 2;

function withTimeout(p) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// Groq's free tier shares one tokens-per-minute budget across every call and
// says exactly how long to wait — honor that instead of guessing.
// Four slots fill at once and the views map may run beside them, so a slot
// often waits its turn: five tries, not three, before it gives up.
const BUSY = /429|rate.?limit|tokens per minute|try again in|timeout/i;
async function withRetry(fn, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      const msg = e?.message || '';
      if (i === attempts - 1) throw e;
      const wait = suggestedWaitMs(msg);
      if (wait !== null) await sleep(Math.min(wait + 500, 30000));
      else if (/429|rate.?limit/i.test(msg)) await sleep(6000);
      else if (/no content in model response|entity too large|413/i.test(msg)) await sleep(600);
      else throw e;
    }
  }
}

// 'ok' | 'unknown' (checker couldn't tell — accepted, labeled honestly) | 'dead'
export async function verifyUrl(url) {
  if (!url) return 'dead';
  try {
    const res = await apiFetch('/api/checkurl', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
    if (!res.ok) return 'unknown';
    const data = await res.json();
    if (/assumed_alive|inconclusive/.test(data.reason || '')) return data.ok ? 'unknown' : 'dead';
    return data.ok ? 'ok' : 'dead';
  } catch { return 'unknown'; }
}

// Results that are never a "real work" for a feed slot: social posts and
// profiles, shops, business/people directories, market-data pages,
// AI-written encyclopedias, and list-shaped titles. Search pads thin result sets
// with these. Dropped before the selector sees them (unless that would leave
// almost nothing).
const JUNK_HOST = /(^|\.)(facebook|instagram|pinterest|linkedin|tiktok|yelp|amazon|ebay|etsy|walmart|tripadvisor|scribd|coursehero|studocu|chegg|brainly|mapquest|bbb|tracxn|rocketreach|cbinsights|crunchbase|zoominfo|leadiq|indeed|glassdoor|investing|grokipedia|tavily)\.[a-z.]+$|^finance\.yahoo\.com$|^find-and-update\.company-information\.service\.gov\.uk$/i;
const LISTY_TITLE = /^\s*(the\s+)?(top\s+)?\d+\s+(best|ways|things|tips|reasons|fixes|signs|steps|facts|secrets|mistakes|habits|examples|ideas|lessons|questions|quotes)\b|\b(top \d+|ultimate guide|everything you need to know|\d+ (best|ways|tips|fixes|signs|reasons))\b/i;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
export const isJunkResult = (r) => JUNK_HOST.test(hostOf(r.url)) || LISTY_TITLE.test(r.title || '');

async function search(query, exclude) {
  const sres = await apiFetch('/api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: String(query), maxResults: 7 }),
  });
  const sdata = await sres.json().catch(() => ({}));
  if (sres.status === 503 && sdata?.error?.type === 'no_search_key') throw Object.assign(new Error('search not configured'), { noSearchKey: true });
  if (!sres.ok) throw new Error(sdata?.error?.message || `search error (${sres.status})`);
  const all = (sdata.results || []).filter((r) => !exclude.includes(r.url)).slice(0, 7);
  const clean = all.filter((r) => !isJunkResult(r));
  return { all, candidates: clean.length >= 2 ? clean : all };
}

async function writeQuery(slot, ctx, exclude, opts) {
  const { query } = parseJSON(await withRetry(() => withTimeout(callLLM({ prompt: searchQueryPrompt(slot, ctx, exclude, opts), maxTokens: 500 }))));
  if (!query || !String(query).trim()) throw new Error('no search query produced');
  return String(query).trim();
}

// query → search → select. The selector may say honestly that nothing fits;
// then ONE more query is written with the first result set as feedback, and the
// second selection must pick (or the slot falls through to the knowledge tier).
// Hebrew first (Hebrew mode only): one Hebrew query; its Hebrew results go to
// the selector, which may say none fits. → the pick, or null to fall back.
async function hebrewSelect(slot, ctx, exclude, { avoid = [] } = {}) {
  const query = await writeQuery(slot, ctx, exclude, { avoid, lang: 'he' });
  const { all } = await search(query, exclude);
  const candidates = all.filter((r) => !isJunkResult(r) && isHebrewItem(r));
  if (candidates.length < HEBREW_ENOUGH) return null;
  const sel = parseJSON(await withRetry(() => withTimeout(callLLM({
    prompt: selectFromResultsPrompt(slot, ctx, candidates, { avoid, allowNone: true }), maxTokens: 1400,
  }))));
  if (sel.none || !sel.url) return null;
  const match = candidates.find((r) => r.url === sel.url)
    || candidates.find((r) => sel.url && (r.url.startsWith(sel.url) || String(sel.url).startsWith(r.url)));
  return match ? { ...sel, url: match.url, query } : null;
}

async function searchSelect(slot, ctx, exclude, { avoid = [] } = {}) {
  if (inHebrew()) {
    try {
      const he = await hebrewSelect(slot, ctx, exclude, { avoid });
      if (he) return he;
    } catch (e) {
      if (e.noSearchKey) throw e;
      console.warn(`[feed] ${slot} Hebrew search failed, trying English:`, e.message);
    }
  }
  let retry = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const query = await writeQuery(slot, ctx, exclude, { avoid, retry, lang: 'en' });
    const { all, candidates } = await search(query, exclude);
    if (!candidates.length) {
      retry = { query, seen: [], reason: 'the search returned nothing' };
      continue;
    }
    const last = attempt === 1;
    const sel = parseJSON(await withRetry(() => withTimeout(callLLM({
      prompt: selectFromResultsPrompt(slot, ctx, candidates, { avoid, allowNone: !last }), maxTokens: 1400,
    }))));
    if (sel.none || !sel.url) {
      retry = { query, seen: all.map((r) => `${r.title} (${hostOf(r.url)})`), reason: sel.reason || 'no candidate fit the slot' };
      continue;
    }
    const match = candidates.find((r) => r.url === sel.url)
      || candidates.find((r) => sel.url && (r.url.startsWith(sel.url) || String(sel.url).startsWith(r.url)));
    if (!match) {
      if (last) throw new Error('selection did not use a candidate URL — rejected');
      retry = { query, seen: all.map((r) => `${r.title} (${hostOf(r.url)})`), reason: 'the pick was not one of the results' };
      continue;
    }
    return { ...sel, url: match.url, query, ...(retry ? { firstQuery: retry.query } : {}) };
  }
  throw new Error(`no search result fit the slot (${clip(retry?.reason, 120)})`);
}

const pick = (it) => ({
  title: String(it.title || '').trim(),
  source: String(it.source || '').trim(),
  url: it.url,
  mediaType: normalizeMediaType(it.mediaType, it.url),
  preview: String(it.preview || '').trim(),
  why: String(it.why || '').trim(),
  field: normalizeField(it.field),
  topics: normalizeTopics(it.topics),
});

// → { slot, title, source, url, mediaType, preview, why, provenance, linkCheck, query } | { slot, failed: true, error }
// opts.avoid: titles/sources other slots already hold (people, channels, works to steer clear of).
export async function fillSlot(slot, ctx, exclude = [], { avoid = [] } = {}) {
  let lastError = 'failed';
  // The search path is the one that finds pieces about the question itself.
  // When it was lost only because the model was busy, it gets a second go
  // after a pause; the Wikipedia tier below used to step in instead, and gave
  // general encyclopedia entries (a war, a treaty) for pointed questions.
  for (let round = 0; round < 2; round++) {
    try {
      const item = await searchSelect(slot, ctx, exclude, { avoid });
      const linkCheck = await verifyUrl(item.url);
      if (linkCheck !== 'dead') return { slot, ...pick(item), query: item.query, ...(item.firstQuery ? { firstQuery: item.firstQuery } : {}), provenance: 'search', linkCheck };
      lastError = 'dead link from search: ' + item.url;
    } catch (e) {
      lastError = e.message;
      console.warn(`[feed] ${slot} retrieve→select failed:`, e.message);
      if (round === 0 && BUSY.test(lastError)) { await sleep(15000); continue; }
    }
    break;
  }
  const searchError = clip(lastError, 160);
  for (const retry of [false, true]) {
    try {
      const item = parseJSON(await withRetry(() => withTimeout(callLLM({ prompt: knowledgePrompt(slot, ctx, exclude, retry), maxTokens: 1000 }))));
      if (!wikiOk(item.url || '')) { lastError = 'non-Wikipedia URL from knowledge tier'; continue; }
      if (exclude.includes(item.url)) { lastError = 'duplicate'; continue; }
      const linkCheck = await verifyUrl(item.url);
      if (linkCheck === 'dead') { lastError = 'dead link: ' + item.url; continue; }
      return { slot, ...pick(item), mediaType: 'reference', provenance: 'knowledge', linkCheck, searchError };
    } catch (e) { lastError = e.message; }
  }
  return { slot, failed: true, error: lastError };
}

// Who made an item, for spotting "the same person twice" across slots: name
// words from the source plus the site (open platforms like YouTube don't count
// as a shared source by themselves).
const PLATFORM_HOST = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|reddit\.com|wikipedia\.org|medium\.com|substack\.com|archive\.org|github\.com|stackexchange\.com|soundcloud\.com|spotify\.com|apple\.com|google\.com)$/i;
const GENERIC_WORDS = new Set('youtube video channel community forum thread wikipedia stack exchange the and for from with about posted interview lecture talk podcast episode blog magazine journal press university college institute school society news review official unknown named stated result author authors staff editors various contributors discussion users members site page website article essay paper documentary film series show book'.split(' '));
function makers(it, question = '') {
  const inQuestion = (w) => String(question).toLowerCase().includes(w.slice(0, 5));
  // capitalised words only: names, not the model's lowercase description of the source
  const src = String(it.source || '').replace(/\([^)]*\)/g, ' ');
  const words = src.split(/[^A-Za-z\u00c0-\u024f]+/).filter((w) => /^[A-Z\u00c0-\u00de]/.test(w)).map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w) && !inQuestion(w));
  const host = hostOf(it.url);
  return new Set([...words, ...(host && !PLATFORM_HOST.test(host) ? ['@' + host] : [])]);
}
const sameMaker = (a, b, question) => { const A = makers(a, question); for (const k of makers(b, question)) if (A.has(k)) return true; return false; };
// Does `item` share a person, channel or site with any of `others`? (shared with src/data/actions.js)
export const repeatsMaker = (item, others, question) => !!item.url && others.some((o) => sameMaker(o, item, question));
export const avoidList = (items) => items.map((k) => `${k.title} (${k.source}, ${hostOf(k.url)})`);

// Fill all slots in parallel (Groq takes what its rate limit allows; on a
// local server a rate-limited call falls back to Claude). If a slot lands on a
// URL, person, channel or site another slot already holds, it is refilled once
// with the others named as things to avoid. onItem(item) streams results.
export async function runFeed(ctx, { exclude = [], slots = SLOTS, onItem = () => {} } = {}) {
  const out = await Promise.all(slots.map((slot) => fillSlot(slot, ctx, exclude)));
  const seen = new Set(exclude);
  const kept = [];
  for (let i = 0; i < out.length; i++) {
    const sameUrl = out[i].url && seen.has(out[i].url);
    if (sameUrl || repeatsMaker(out[i], kept, ctx.question)) {
      const avoid = avoidList(kept);
      const again = await fillSlot(out[i].slot, ctx, [...seen, out[i].url], { avoid });
      if (sameUrl || !again.failed) out[i] = again; // a repeated URL is never kept
    }
    if (out[i].url) { seen.add(out[i].url); kept.push(out[i]); }
    onItem(out[i]);
  }
  return out;
}
