// "Looking further" — when a Promenade lean finds too few items in the day's
// pool, search the web for that lean, score what comes back with the same
// scorer the corpus uses, and add the good ones to that day's pool so the next
// person leaning there gets them without a new search.
//
// Retrieve → score, never generate: every URL is a real search result, passed
// through verbatim (server/proxyCore.js tavilySearch). The only fetch of a
// result page is to measure its length (server/length.js, through the
// reader's own guarded fetch: public addresses, size cap, short timeout).
//
// Cost per thin lean, at most: SEARCH_QUERIES Tavily searches (basic, 1 credit
// each) and SCORE_MAX Groq calls (one classifier call per candidate). A lean
// already searched against today's pool costs nothing: its finds are served
// from the store.
//
// Store layout (server/store.js):
//   m2:corpus-extra:<pool>   "i:<urlhash>" → scored item JSON
//                            "q:<leanhash>" → { at, urls } (this lean was searched)
//   m2:further               "u:<userId>" → JSON [timestamps]  (per-person limit)
//                            "d:<YYYY-MM-DD>" → count           (all-people daily cap)
// <pool> is the corpus's generatedAt, so the extras belong to one day's pool
// and stop counting when the daily rebuild replaces it.

import crypto from 'node:crypto';
import net from 'node:net';
import {
  scoreItem, cleanLean, hasLean, parseLooseJSON, heuristicPart, inLeanArea,
  DOMAINS, BRIDGING_FLOOR,
} from '../src/scoring.js';
import { tavilySearch, hasSearchKey } from './proxyCore.js';
import { makeClassifier, modelEngagement, hashString } from './corpus.js';
import { getBlob, hashGet, hashGetAll, hashUpdate, hashIncr } from './store.js';
import { measureMany } from './length.js';
import { withLength } from '../src/length.js';

export const SEARCH_QUERIES = 3;      // Tavily searches per thin lean
export const RESULTS_PER_QUERY = 8;
export const SCORE_MAX = 10;          // Groq classifier calls per thin lean
const SCORE_CONCURRENCY = 5;
const LLM_TIMEOUT_MS = 12_000;
const SEARCH_TIMEOUT_MS = 10_000;
const DEADLINE_MS = 40_000;           // the function may run 60s (vercel.json)
const LENGTH_BUDGET_MS = 8_000;       // measuring found pages, alongside scoring
export const EXTRAS_MAX = 300;        // items added to one day's pool, at most
const EXTRAS_TTL_S = 3 * 24 * 3600;
export const USER_PER_HOUR = Number(process.env.FURTHER_PER_HOUR || 6);
export const USER_PER_DAY = Number(process.env.FURTHER_PER_DAY || 20);
export const ALL_PER_DAY = Number(process.env.FURTHER_ALL_PER_DAY || 40);

const fail = (status, type, message) => Object.assign(new Error(message), { status, type });

// ---- quality: the corpus's sources are hand-picked; search results are not ----
// Kept out: content farms, Q&A and homework sites, shops, social feeds, and
// generic encyclopedia overviews (a specific work beats an overview).
export const JUNK_DOMAINS = [
  'pinterest.com', 'quora.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  'linkedin.com', 'reddit.com', 'threads.net', 'amazon.com', 'ebay.com', 'etsy.com', 'walmart.com',
  'alibaba.com', 'aliexpress.com', 'temu.com', 'wikihow.com', 'answers.com', 'reference.com', 'ask.com',
  'scribd.com', 'coursehero.com', 'chegg.com', 'studocu.com', 'slideshare.net', 'brainly.com',
  'bartleby.com', 'ipl.org', 'gradesaver.com', 'sparknotes.com', 'enotes.com', 'msn.com',
  'yahoo.com', 'wikipedia.org', 'britannica.com', 'dictionary.com', 'merriam-webster.com',
  'fandom.com', 'tripadvisor.com', 'yelp.com', 'issuu.com', 'medium.com/tag',
];
const JUNK_PATH = /\/(tag|tags|category|categories|search|shop|product|products|collections|cart|login|signin|signup|author|authors|topics?)(\/|$)|\/page\/\d+\/?$/i;
const JUNK_TITLE = [
  /\b(top|best)\s+\d+\b/i, /\b\d+\s+(best|ways|tips|things|reasons|hacks|ideas|facts|secrets|mistakes)\b/i,
  /you won[’']t believe/i, /\bultimate guide\b/i, /everything you need to know/i, /\b(coupon|promo code|discount|deals?|for sale|buy now|price list)\b/i,
  /\b(cheat ?sheet|quiz|worksheet|lesson plan|essay (example|sample)s?|free essay)\b/i,
];

// Same sites under other country domains (pinterest.co.uk, amazon.de, …).
const JUNK_BRANDS = /(^|\.)(pinterest|amazon|ebay|quora|wikipedia|britannica|tripadvisor|yelp)\.[a-z]{2,3}(\.[a-z]{2})?$/;

function hostOf(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }
const onDomain = (host, d) => host === d || host.endsWith('.' + d);

// The address rules the reader applies at fetch time, applied here up front so
// nothing that couldn't be opened safely ever enters the pool: http(s) only, no
// credentials, a real public host name (no IP literals, localhost or internal
// names). The reader still re-checks DNS at every redirect when it is opened.
export function safeResultUrl(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || net.isIP(host) || !host.includes('.')) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example)$/.test(host)) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  return true;
}

// → '' if it passes, else why it was left out (counted in 'skipped').
export function junkReason(r) {
  if (!safeResultUrl(r.url)) return 'address';
  const u = new URL(r.url);
  const host = hostOf(r.url);
  const hostPath = host + u.pathname.toLowerCase();
  if (JUNK_BRANDS.test(host) || JUNK_DOMAINS.some((d) => d.includes('/') ? hostPath.startsWith(d) : onDomain(host, d))) return 'site';
  if (u.pathname === '/' || u.pathname === '') return 'homepage';
  if (JUNK_PATH.test(u.pathname)) return 'listing';
  if (/\.(pdf|docx?|pptx?|xlsx?|zip|jpe?g|png|gif|mp3)$/i.test(u.pathname)) return 'file';
  const title = (r.title || '').trim();
  if (title.length < 12) return 'title';
  if (JUNK_TITLE.some((rx) => rx.test(title))) return 'listicle';
  if ((r.snippet || '').trim().length < 60) return 'no-text';
  return '';
}

// Tracking parameters and fragments don't make a page different.
export function normUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|ref_src$)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    return u.toString().replace(/\/$/, '');
  } catch { return url; }
}

// ---- the lean → a few queries ---------------------------------------------------
const DEPTH = [
  'a short, clear introduction to', 'an accessible essay on', 'a thoughtful essay or long read on',
  'an in-depth essay on', 'a detailed, rigorous study of',
];
const MOOD = {
  sharpen: 'a careful essay drawing a sharp distinction in',
  complicate: 'an essay that complicates the usual story about',
  bridge: 'an essay connecting {t} with a distant field', // {t} placed inside
  ground: 'a concrete case study or first-hand account of',
};

export const leanKey = (lean) => JSON.stringify([
  [...lean.fields].sort(), [...lean.fields].sort().map((d) => [...(lean.parts?.[d] || [])].sort()),
  lean.ring, lean.mood, (lean.hunch || '').trim().toLowerCase(),
]);
const shortHash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);

// A lean can be searched when it names a field or has a hunch; depth and mood
// alone say nothing to search for.
export const searchable = (lean) => !!(lean.fields.length || (lean.hunch || '').trim());

// → [{ q, field|null, part|null }], at most SEARCH_QUERIES.
export function buildQueries(lean) {
  const hunch = (lean.hunch || '').trim();
  const targets = [];
  for (const d of lean.fields) {
    const ps = lean.parts?.[d] || [];
    if (ps.length) ps.forEach((p) => targets.push({ field: d, part: p }));
    else targets.push({ field: d, part: null });
  }
  if (!targets.length && hunch) targets.push({ field: null, part: null });
  const topicOf = (t) => (t.part ? `${t.part} (${t.field})` : t.field) || hunch;
  const lead = (t) => {
    const topic = topicOf(t);
    if (lean.mood) {
      const m = MOOD[lean.mood];
      return m.includes('{t}') ? m.replace('{t}', topic) : `${m} ${topic}`;
    }
    return `${lean.ring != null ? DEPTH[lean.ring] : DEPTH[2]} ${topic}`;
  };
  const withHunch = (s, t) => (hunch && t.field ? `${s}, about ${hunch}` : s);
  const out = targets.slice(0, SEARCH_QUERIES).map((t) => ({ ...t, q: withHunch(lead(t), t) }));
  // One target only: ask a second way, for talks and interviews, so one
  // search engine's idea of the topic doesn't decide the whole shelf.
  if (out.length === 1 && SEARCH_QUERIES > 1) {
    const t = out[0];
    out.push({ ...t, q: withHunch(`a talk, lecture, interview or podcast episode on ${topicOf(t)}`, t) });
  }
  return out;
}

// ---- limits -----------------------------------------------------------------------
const HOUR = 3600 * 1000, DAY = 24 * HOUR;
const dayStamp = (now) => new Date(now).toISOString().slice(0, 10);

async function checkAndCount(userId, now) {
  const raw = await hashGet('m2:further', `u:${userId}`);
  let times = [];
  try { times = (JSON.parse(raw || '[]') || []).filter((t) => Number.isFinite(t) && now - t < DAY); } catch {}
  if (times.filter((t) => now - t < HOUR).length >= USER_PER_HOUR) throw fail(429, 'rate_limited', 'You’ve looked further a lot this hour. Try again later, or widen the lean.');
  if (times.length >= USER_PER_DAY) throw fail(429, 'rate_limited', 'You’ve looked further a lot today. Try again tomorrow, or widen the lean.');
  const all = Number(await hashGet('m2:further', `d:${dayStamp(now)}`)) || 0;
  if (all >= ALL_PER_DAY) throw fail(429, 'daily_cap', 'Mosaic has looked further as much as it can today. Try again tomorrow, or widen the lean.');
  times.push(now);
  // Everything here is about the last day, so the hash may lapse after two quiet days.
  await hashUpdate('m2:further', { set: { [`u:${userId}`]: JSON.stringify(times) }, ttlSeconds: 2 * 24 * 3600 });
  await hashIncr('m2:further', `d:${dayStamp(now)}`, 1, 2 * 24 * 3600);
}

// ---- the day's pool ----------------------------------------------------------------
async function currentPool() {
  let corpus = null;
  try { corpus = JSON.parse((await getBlob('corpus')) || 'null'); } catch {}
  const id = corpus?.meta?.generatedAt || 'static';
  return { id, hash: `m2:corpus-extra:${id}`, items: Array.isArray(corpus?.items) ? corpus.items : [] };
}

const parseJSON = (v) => { try { return JSON.parse(v); } catch { return null; } };

// The items added to the pool with this generatedAt (for /api/corpus).
export async function readExtras(generatedAt) {
  const raw = await hashGetAll(`m2:corpus-extra:${generatedAt || 'static'}`);
  return Object.entries(raw).filter(([k]) => k.startsWith('i:')).map(([, v]) => parseJSON(v)).filter(Boolean);
}

// The pool plus its extras, deduped by url (extras never replace the corpus's own).
export function mergeExtras(items, extras) {
  const seen = new Set(items.map((it) => normUrl(it.url)));
  const out = [...items];
  for (const it of extras) {
    const k = normUrl(it.url);
    if (!it.url || seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  return out;
}

// ---- scoring --------------------------------------------------------------------------
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]);

async function mapLimit(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

function toItem(r, target, now) {
  const host = hostOf(r.url);
  const ts = r.published ? Date.parse(r.published) : NaN;
  const id = `web-${hashString(r.url)}`;
  return {
    id,
    title: r.title.replace(/\s+/g, ' ').trim().slice(0, 300),
    excerpt: r.snippet.replace(/\s+/g, ' ').trim().slice(0, 400),
    url: r.url,
    source: host,
    timestamp: Number.isFinite(ts) && ts <= now ? ts : now,
    // Search results carry no votes or comments; model them the way the RSS
    // items are modelled, and say so.
    engagement: modelEngagement(id, Number.isFinite(ts) ? ts : now),
    engagementModeled: true,
    found_by: 'search',
    _hint: target.field || undefined,
  };
}

// → scored item. The classifier picks the field; if it can't answer, the field
// the search was for stands in (rather than heuristicDomain's hash bucket), and
// the part comes from keywords, else the part searched for, and says so.
async function scoreOne(raw, target, { classify, apiKey, deadline }) {
  let llmOk = false;
  const timed = classify && Date.now() < deadline
    ? async (prompt) => {
      const text = await withTimeout(classify(prompt), Math.min(LLM_TIMEOUT_MS, Math.max(1000, deadline - Date.now())));
      const j = parseLooseJSON(text);
      if (j && DOMAINS.includes(j.domain)) llmOk = true;
      return text;
    }
    : null;
  const s = await scoreItem(raw, { apiKey, classify: timed });
  if (!llmOk && target.field) {
    s.domain = target.field;
    const kw = heuristicPart(s, target.field);
    s.part = kw || target.part || null;
    s.part_by = kw ? 'keywords' : s.part ? 'search' : null;
  }
  delete s._hint;
  delete s._words;
  return { item: s, llm: !!timed };
}

// ---- the whole thing --------------------------------------------------------------------
// → { items, added, fit, searched, calls:{search, llm}, skipped, ms }
// items: what this lean found (new now, or found by an earlier search of the
// same lean against today's pool). Throws {status, type, message} errors.
export async function lookFurther(user, rawLean, { now = Date.now(), search = tavilySearch, classify = makeClassifier('promenade-further'), measure = measureMany } = {}) {
  const t0 = Date.now();
  const deadline = t0 + DEADLINE_MS;
  const lean = cleanLean(rawLean);
  if (!hasLean(lean) || !searchable(lean)) throw fail(400, 'nothing_to_search', 'Pick a field or write a hunch first.');

  const pool = await currentPool();
  const memoField = `q:${shortHash(leanKey(lean))}`;
  const memo = parseJSON(await hashGet(pool.hash, memoField));
  if (memo) {
    const all = await hashGetAll(pool.hash);
    const items = (memo.urls || []).map((u) => parseJSON(all[`i:${shortHash(normUrl(u))}`])).filter(Boolean);
    return { items, added: 0, fit: items.filter((it) => inLeanArea(it, lean)).length, searched: false, calls: { search: 0, llm: 0 }, skipped: {}, ms: Date.now() - t0 };
  }

  // Only a real search counts against the limits.
  if (search === tavilySearch && !hasSearchKey()) throw fail(503, 'no_search_key', 'TAVILY_API_KEY is not configured on the server.');
  await checkAndCount(user.id, now);

  // Search. One failed query doesn't sink the others.
  const queries = buildQueries(lean);
  const settled = await Promise.allSettled(queries.map((q) => search(q.q, {
    maxResults: RESULTS_PER_QUERY, excludeDomains: JUNK_DOMAINS.filter((d) => !d.includes('/')), timeoutMs: SEARCH_TIMEOUT_MS,
  })));
  const failures = settled.filter((s) => s.status === 'rejected');
  if (failures.length === settled.length) {
    const e = failures[0].reason;
    if (e?.type === 'no_search_key') throw fail(503, 'no_search_key', e.message);
    throw fail(502, 'search_upstream', `The search didn’t answer: ${e?.message || 'unknown error'}`);
  }

  // Filter and dedupe against the pool and its extras so far.
  const existing = await hashGetAll(pool.hash);
  const extrasCount = Object.keys(existing).filter((k) => k.startsWith('i:')).length;
  const known = new Set([...pool.items.map((it) => normUrl(it.url)), ...Object.values(existing).map(parseJSON).filter((x) => x?.url).map((x) => normUrl(x.url))]);
  const skipped = {};
  const perQuery = settled.map((s, qi) => (s.status === 'fulfilled' ? s.value : [])
    .filter((r) => {
      const why = junkReason(r) || (known.has(normUrl(r.url)) ? 'already-in-pool' : '');
      if (why) { skipped[why] = (skipped[why] || 0) + 1; return false; }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .map((r) => ({ r, target: queries[qi] })));
  // Round-robin across queries so each part of the lean gets its share.
  const cands = [];
  const taken = new Set();
  for (let i = 0; cands.length < SCORE_MAX && perQuery.some((l) => l.length > i); i++) {
    for (const list of perQuery) {
      const c = list[i];
      if (!c || cands.length >= SCORE_MAX) continue;
      const k = normUrl(c.r.url);
      if (taken.has(k)) continue;
      taken.add(k); cands.push(c);
    }
  }

  // Score with the corpus's scorer.
  const apiKey = process.env.PERSPECTIVE_API_KEY || null;
  const raws = cands.map(({ r, target }) => toItem(r, target, now));
  // Their lengths, measured alongside the scoring (tiles are sized by them).
  const measuring = measure(raws, { budgetMs: Math.max(0, Math.min(LENGTH_BUDGET_MS, deadline - Date.now() - 2000)) }).catch(() => 0);
  const scored = await mapLimit(cands, SCORE_CONCURRENCY, ({ target }, i) => scoreOne(raws[i], target, { classify, apiKey, deadline }));
  await measuring;
  scored.forEach((s, i) => { if (raws[i].minutes) { s.item.minutes = raws[i].minutes; s.item.length_by = raws[i].length_by; } Object.assign(s.item, withLength(s.item)); });
  const llmCalls = scored.filter((s) => s.llm).length;
  const good = scored.map((s) => s.item).filter((it) => {
    if ((it.scores?.bridging ?? 0) < BRIDGING_FLOOR) { skipped['below-floor'] = (skipped['below-floor'] || 0) + 1; return false; }
    return true;
  }).slice(0, Math.max(0, EXTRAS_MAX - extrasCount));

  // Into the day's pool, plus the note that this lean has been searched.
  const set = {};
  for (const it of good) set[`i:${shortHash(normUrl(it.url))}`] = JSON.stringify(it);
  set[memoField] = JSON.stringify({ at: now, urls: good.map((it) => it.url) });
  await hashUpdate(pool.hash, { set, ttlSeconds: EXTRAS_TTL_S });

  return {
    items: good,
    added: good.length,
    fit: good.filter((it) => inLeanArea(it, lean)).length,
    searched: true,
    calls: { search: queries.length, llm: llmCalls },
    skipped,
    ms: Date.now() - t0,
  };
}

