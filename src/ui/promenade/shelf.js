// The Promenade's shelf: loading the daily corpus, composing it with
// src/scoring.js, and remembering the shelf for this visit so the Desk and the
// Promenade page always show the same cards (including after a refresh).
//
// Composition is scoring.js's composePromenadeShelf. It sorts by quality, so
// calling it again returns the same cards; "Refresh the shelf" therefore
// rotates out the URLs already shelved this visit and composes from the rest.

import { useSyncExternalStore } from 'react';
import { composePromenadeShelf, heuristicDomain, DOMAINS, SLOT_BLURB as SCORING_BLURB } from '../../scoring.js';
import * as R from '../../data/record.js';

// ---- open questions (editorial) ------------------------------------------------
// Ported from the old app's EDITORIAL_LIVE. They link nowhere; holding one
// starts a thread from the question.
export const OPEN_QUESTIONS = [
  {
    id: 'ed-1', editorial: true, slot: 'complicate', domain: 'philosophy & ideas',
    title: 'When does a tool stop being a tool and start being a habitat?',
    source: 'Mosaic', url: '',
    why: 'The line between using an environment and living inside one.',
    scores: { bridging: 0.9, engagement: 0 }, scored_by: 'editorial',
  },
  {
    id: 'ed-2', editorial: true, slot: 'bridge', domain: 'nature & environment',
    title: 'What does an ecologist mean by "edge," and does it apply to attention?',
    source: 'Mosaic', url: '',
    why: 'A shape borrowed from ecology, offered as a way into how attention has edges too.',
    scores: { bridging: 0.88, engagement: 0 }, scored_by: 'editorial',
  },
  {
    id: 'ed-3', editorial: true, slot: 'ground', domain: 'craft & making',
    title: 'A luthier on why a repair can be better than the original',
    source: 'Mosaic', url: '',
    why: 'A concrete case to ground a wide question about restoration, wear, and improvement.',
    scores: { bridging: 0.86, engagement: 0 }, scored_by: 'editorial',
  },
];

// Plain section titles (scoring.js still carries older wording).
export function sectionTitle(sec, hasThreads) {
  if (sec.key === 'near') return hasThreads ? 'Near your threads' : 'From all over';
  if (sec.key === 'far') return 'Far field';
  return 'Open questions';
}
export function sectionNote(sec, hasThreads) {
  if (sec.key === 'near') return hasThreads ? 'Close to what your threads are about.' : 'Once you hold a thread, this part of the shelf leans toward it.';
  if (sec.key === 'far') return 'Away from what you hold, each from a different field.';
  return 'Questions to try on. They link nowhere; hold one to make it yours.';
}

// ---- threads → taxonomy domains ---------------------------------------------------
// A reading's domain is free text ("psychology of habit"). Map it onto the
// corpus taxonomy. Supplementary cues cover words readings tend to use that the
// scoring keywords don't.
const EXTRA_CUES = [
  ['health & mind', ['psycholog', 'habit', 'mind', 'cognit', 'emotion', 'behavio', 'attention', 'memory']],
  ['arts & culture', ['aesthetic', 'taste', 'art ', 'arts', 'literature', 'culture', 'media', 'craft of writing']],
  ['business & economics', ['economic', 'pricing', 'price', 'market', 'labour', 'labor', 'money']],
  ['society & politics', ['urban', 'city', 'cities', 'governance', 'politic', 'social', 'sociolog', 'community', 'law']],
  ['science', ['biolog', 'ecolog', 'physic', 'chemi', 'evolution', 'individuality', 'organism']],
  ['technology', ['software', 'open-source', 'open source', 'computing', 'internet', 'engineering']],
  ['philosophy & ideas', ['philosoph', 'ethic', 'epistem', 'meaning', 'identity', 'ontology']],
  ['history', ['histor', 'ancient', 'medieval']],
  ['nature & environment', ['nature', 'climate', 'environment', 'animal', 'plant', 'lichen']],
  ['math & abstraction', ['math', 'logic', 'statistic']],
  ['craft & making', ['craft', 'making', 'repair', 'hobby', 'hobbies']],
  ['sport & play', ['sport', 'game', 'play']],
];

// heuristicDomain() hashes into a random bucket when no keyword hits. Probe
// with different urls: if the answers disagree, it was a hash, not a match.
function keywordDomain(text) {
  const probes = ['a', 'b', 'c'].map((u) => heuristicDomain({ title: text, url: u }));
  return probes.every((p) => p === probes[0]) ? probes[0] : null;
}

export function domainsForText(text) {
  const t = (text || '').toLowerCase();
  if (!t) return [];
  if (DOMAINS.includes(t)) return [t];
  const out = new Set();
  for (const [d, cues] of EXTRA_CUES) if (cues.some((c) => new RegExp('\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t))) out.add(d);
  if (!out.size) { const k = keywordDomain(t); if (k) out.add(k); }
  return [...out];
}

export function gatherUserDomains(threads, pool = []) {
  const byUrl = new Map(pool.map((it) => [it.url, it]));
  const out = new Set();
  for (const t of threads) {
    if (t.status !== 'active') continue;
    const seeded = t.seed?.url && byUrl.get(t.seed.url);
    if (seeded?.domain) out.add(seeded.domain);
    const fromReading = domainsForText(t.reading?.domain);
    fromReading.forEach((d) => out.add(d));
    if (!fromReading.length && !seeded) domainsForText(R.currentArticulation(t)).forEach((d) => out.add(d));
  }
  return [...out];
}

// Ratings the user gave items (by url) feed within-slot quality only.
function makeRatingFor() {
  const byUrl = new Map();
  for (const i of R.allItems()) {
    if (!i.url || !i.rating) continue;
    const vals = Object.values(i.rating).filter((v) => typeof v === 'number');
    if (vals.length) byUrl.set(i.url, vals.reduce((s, v) => s + v, 0) / (vals.length * 4));
  }
  if (!byUrl.size) return null;
  return (item) => (byUrl.has(item.url) ? byUrl.get(item.url) : null);
}

// ---- card text ---------------------------------------------------------------------
// Feeds append boilerplate: "The post X first appeared on Quanta Magazine",
// "… - by Author Read on Aeon", "Watch on Aeon".
export function cleanExcerpt(text) {
  let s = (text || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*The post .{0,300}? (?:first )?appeared (?:first )?on .{0,80}$/i, '');
  s = s.replace(/\s+-\s+by\s+[^-]{1,120}?\s*(?:Read|Watch|Listen)\s+on\s+\w[\w\s]{0,30}$/i, '');
  s = s.replace(/\s*(?:Read|Watch|Listen) on (?:Aeon|Psyche)\.?$/i, '');
  s = s.replace(/\s+-\s+by\s+[^.!?]{1,80}$/i, '');
  s = s.replace(/\s*(?:Continue reading|Read more)\s*[.…»›]*\s*$/i, '');
  return s.trim();
}

// The heuristic scorer writes "<blurb> — in <domain>", which is not a reason.
export function realWhy(card) {
  const w = (card.why || '').trim();
  if (!w) return '';
  const slot = card.slot || card.moveType;
  if (w === `${SCORING_BLURB[slot]} — in ${card.domain}`) return '';
  if (Object.values(SCORING_BLURB).some((b) => w.startsWith(b + ' — in '))) return '';
  return w;
}

// "e.g. …" placeholder for the Hold composer, from the card itself.
export function holdPlaceholder(card) {
  if (card.editorial) return 'Say it your own way, or narrow it to the part that caught you';
  let t = (card.title || '').replace(/\s+/g, ' ').trim();
  if (t.length > 42) t = t.slice(0, 40).replace(/\s+\S*$/, '') + '…';
  switch (card.slot) {
    case 'complicate': return `e.g. What does “${t}” leave out?`;
    case 'bridge': return `e.g. Show me where else “${t}” turns up`;
    case 'ground': return `e.g. What actually happened in “${t}”?`;
    default: return `e.g. What’s really at stake in “${t}”?`;
  }
}

// ---- corpus loading -----------------------------------------------------------------
const today = () => new Date().toDateString();
let corpus = null; // { meta, items, from, day }
let corpusPromise = null;

async function fetchCorpus() {
  const errors = [];
  for (const url of ['/api/corpus', '/corpus.json']) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.items) || !json.items.length) throw new Error(`${url} was empty`);
      return { meta: json.meta || {}, items: json.items, from: url, day: today() };
    } catch (e) { errors.push(e.message); }
  }
  throw new Error(errors.join('; '));
}

// ---- the visit's shelf (shared store) ---------------------------------------------
// state: { status:'idle'|'loading'|'ready'|'error', shelf, meta, error, refreshes }
let state = { status: 'idle', shelf: null, meta: null, error: null, refreshes: 0 };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };
const seen = new Set();

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = (seed | 0) || 1;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function compose(nonce) {
  const full = corpus.items;
  let pool = full.filter((it) => !seen.has(it.url));
  if (pool.length < 30) { seen.clear(); pool = full; }
  const threads = R.allThreads();
  const daySeed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const gen = Date.parse(corpus.meta?.generatedAt || '');
  const shelf = composePromenadeShelf(seededShuffle(pool, daySeed + nonce * 7919), {
    userDomains: gatherUserDomains(threads, full),
    // Rotate the open questions too: two sets of three would be the whole list,
    // so start each refresh one further along.
    editorial: OPEN_QUESTIONS.slice(nonce % OPEN_QUESTIONS.length).concat(OPEN_QUESTIONS.slice(0, nonce % OPEN_QUESTIONS.length)),
    perSection: 3,
    now: Number.isFinite(gen) ? gen : Date.now(),
    ratingFor: R.getSettings().ratings ? makeRatingFor() : null,
  });
  shelf.sections.forEach((sec) => sec.cards.forEach((c) => c.url && seen.add(c.url)));
  return shelf;
}

export async function ensureShelf() {
  if (state.status === 'loading') return;
  if (state.status === 'ready' && corpus?.day === today()) return;
  set({ status: 'loading', error: null });
  try {
    if (!corpus || corpus.day !== today()) {
      corpusPromise = corpusPromise || fetchCorpus();
      corpus = await corpusPromise;
      seen.clear();
    }
    set({ status: 'ready', shelf: compose(0), meta: { ...corpus.meta, from: corpus.from }, refreshes: 0 });
  } catch (e) {
    set({ status: 'error', error: e.message || String(e) });
  } finally {
    corpusPromise = null;
  }
}

export function refreshShelf() {
  if (!corpus) return ensureShelf();
  const n = state.refreshes + 1;
  set({ shelf: compose(n), refreshes: n });
}

export function retryShelf() { corpus = null; set({ status: 'idle' }); return ensureShelf(); }

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const useShelf = () => useSyncExternalStore(subscribe, () => state);

// The full scored pool behind the shelf (every admitted item, not just the
// cards chosen for today's sections) — the Mandala reads from this directly,
// since it composes its own one-pick-per-domain from the whole corpus.
export const corpusItems = () => corpus?.items || [];

// The Desk's three: the first card of each section, as the Promenade shows them.
export function deskPicks(shelf) {
  if (!shelf) return [];
  const picks = shelf.sections.map((s) => s.cards[0] && { card: s.cards[0], section: s }).filter(Boolean);
  if (picks.length < 3) {
    for (const s of shelf.sections) for (const c of s.cards.slice(1)) if (picks.length < 3) picks.push({ card: c, section: s });
  }
  return picks.slice(0, 3);
}
