// The views page (/views), live path: a typed question mapped on the server.
// Public (no sign-in), so it is capped: per address per hour, and in total
// per day, and every answer is cached so a question is only ever paid for once.
//
//   1 Groq call   maps the question (settled facts, views, the points they split on)
//   ≤7 searches   one per view, one per settled fact (Tavily, real results only)
//   1 Groq call   picks, for each view, pieces written by people who hold it,
//                 and for each fact a strong source; URLs are never model-written
//   link check    every picked page is opened; one that doesn't load is dropped
//
// Store: m2:views-demo  "q:<hash>" → JSON map   "d:<day>" / "ip:<ip>:<hour>" → counts

import { handleLLM, tavilySearch, hasSearchKey, hasKey } from './proxyCore.js';
import { claudeFallbackOn } from './claudeCli.js';
import { hashGet, hashUpdate, hashIncr } from './store.js';
import { safeResultUrl } from './further.js';
import { hashString } from './corpus.js';
import { parseJSON, suggestedWaitMs } from '../src/engine/llm.js';
import { MAP_SYSTEM, PICK_SYSTEM, mapPrompt, pickPrompt, normalizeMap, hostOf } from '../src/engine/viewsDemo.js';

export const DEMO_PER_DAY = Number(process.env.VIEWS_DEMO_PER_DAY || 60);
export const DEMO_PER_HOUR_PER_IP = Number(process.env.VIEWS_DEMO_PER_HOUR || 8);
const HASH = 'm2:views-demo';
const CACHE_TTL_S = 90 * 24 * 3600;
const DEADLINE_MS = 55_000; // the function may run 60s (vercel.json)
const fail = (status, type, message) => Object.assign(new Error(message), { status, type });
const norm = (s) => String(s || '').toLowerCase().replace(/[?!.\s]+/g, ' ').trim();

export const liveReady = () => (hasKey() || claudeFallbackOn()) && hasSearchKey();

async function groqJSON({ system, prompt, maxTokens, deadline, llm }) {
  let tokens = maxTokens, last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { status, json } = await llm({
      model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_tokens: tokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }, 'views-demo');
    if (status === 200) {
      const text = json?.choices?.[0]?.message?.content;
      if (text) { try { return parseJSON(text); } catch (e) { last = e; } } else last = new Error('No content in model response');
      tokens = Math.min(Math.round(tokens * 1.3), 2000);
      continue;
    }
    const msg = json?.error?.message || `LLM ${status}`;
    last = new Error(msg);
    const wait = status === 429 ? (suggestedWaitMs(msg) ?? 8000) + 500 : status >= 500 ? 1500 : null;
    if (wait === null || Date.now() + wait > deadline - 12_000) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  throw fail(502, 'views_model', 'The mapping model did not answer just now. Try again in a minute, or open a ready example.');
}

const BAD_HOST = /(^|\.)(pinterest|facebook|instagram|tiktok|x|twitter|quora|amazon|ebay|linkedin)\.com$/;
const usable = (r) => r?.url && safeResultUrl(r.url) && !BAD_HOST.test(hostOf(r.url)) && (r.title || '').trim().length >= 8 && (r.snippet || '').trim().length >= 40;

async function searchAll(groups, search) {
  return Promise.all(groups.map(async (g) => {
    if (!g.search) return [];
    try {
      const rs = await search(g.search, { maxResults: 7, timeoutMs: 9000 });
      return rs.filter(usable).slice(0, 5);
    } catch (e) {
      console.warn('[views-demo] search failed:', e.message);
      return [];
    }
  }));
}

// Opens the page. Gone or broken (404, 410, 5xx, no answer) → false. A site
// that turns automated visitors away (401/403/429) is up, so it stays.
export async function linkLoads(url, { timeoutMs = 7000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      redirect: 'follow', signal: ctrl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MosaicLinkCheck/1.0)', accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    try { await res.body?.cancel(); } catch {}
    return res.ok || [401, 403, 429].includes(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function mapLive(question, {
  ip = 'unknown', now = Date.now(), llm = handleLLM,
  search = hasSearchKey() ? tavilySearch : null, check = linkLoads,
} = {}) {
  const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (q.length < 6) throw fail(400, 'bad_request', 'Type a question first.');
  const key = `q:${hashString(norm(q))}`;

  const cached = await hashGet(HASH, key).catch(() => null);
  if (cached) { try { return { ...JSON.parse(cached), cached: true }; } catch {} }

  if (!search || !(hasKey() || claudeFallbackOn() || llm !== handleLLM)) {
    throw fail(503, 'live_off', 'Live mapping is not switched on here yet. The ready examples work.');
  }

  const hour = new Date(now).toISOString().slice(0, 13);
  const mine = await hashIncr(HASH, `ip:${ip}:${hour}`, 1, 2 * 24 * 3600).catch(() => 0);
  if (mine > DEMO_PER_HOUR_PER_IP) throw fail(429, 'views_rate', 'That’s a lot of new questions in an hour. Try again a little later, or open a ready example.');
  const used = await hashIncr(HASH, `d:${hour.slice(0, 10)}`, 1, 3 * 24 * 3600).catch(() => 0);
  if (used > DEMO_PER_DAY) throw fail(429, 'views_daily_cap', 'Enough new questions have been mapped today. The ready examples still work.');

  const deadline = now + DEADLINE_MS;
  const raw = await groqJSON({ system: MAP_SYSTEM, prompt: mapPrompt(q), maxTokens: 1900, deadline, llm });
  const map = normalizeMap(raw, { question: q });

  // Search for each view and each settled fact, then let the model pick.
  const groups = [
    ...map.views.map((v) => ({ kind: 'view', label: `"${v.name}": ${v.summary}`, search: v.search, ref: v })),
    ...map.settled.map((f) => ({ kind: 'fact', label: f.text, search: f.search, ref: f })),
  ];
  const results = await searchAll(groups, search);
  groups.forEach((g, i) => { g.results = results[i]; g.ref.sources = []; });
  if (results.some((r) => r.length) && Date.now() < deadline - 12_000) {
    try {
      const out = await groqJSON({ system: PICK_SYSTEM, prompt: pickPrompt(groups), maxTokens: 900, deadline, llm });
      const picked = [];
      for (const p of Array.isArray(out?.picks) ? out.picks : []) {
        const g = groups[Number(p?.group) - 1];
        const r = g?.results?.[Number(p?.result) - 1];
        if (!g || !r || g.ref.sources.some((s) => s.url === r.url)) continue;
        if (g.ref.sources.length >= (g.kind === 'view' ? 2 : 1)) continue;
        // A quote only counts if it is really in the result text.
        const quote = String(p.quote || '').replace(/\s+/g, ' ').trim();
        const inText = quote && String(r.snippet || '').replace(/\s+/g, ' ').includes(quote.slice(0, 60));
        const src = {
          title: String(r.title).slice(0, 200), url: r.url, outlet: String(p.outlet || '').replace(/\s+/g, ' ').trim().slice(0, 80) || hostOf(r.url),
          author: '', date: r.published ? String(r.published).slice(0, 7) : '', quote: inText ? quote.slice(0, 200) : '',
        };
        g.ref.sources.push(src);
        picked.push(src);
      }
      // Every picked page must open.
      const ok = await Promise.all(picked.map((s) => check(s.url)));
      const dead = new Set(picked.filter((_, i) => !ok[i]).map((s) => s.url));
      for (const g of groups) g.ref.sources = g.ref.sources.filter((s) => !dead.has(s.url));
    } catch (e) {
      console.warn('[views-demo] picking sources failed:', e.message);
    }
  }

  // Views must stand on real pieces: keep only sourced views, when enough are.
  let views = map.views;
  const sourced = views.filter((v) => v.sources.length);
  if (sourced.length >= 2) views = sourced;
  views = views.map(({ search: _s, ...v }) => v);
  const keep = new Set(views.map((v) => v.id));
  const cruxes = map.cruxes
    .map((c) => ({ ...c, positions: Object.fromEntries(Object.entries(c.positions).filter(([id]) => keep.has(id))) }))
    .filter((c) => Object.values(c.positions).includes('left') && Object.values(c.positions).includes('right'));
  const settled = map.settled.map(({ search: _s, ...f }) => f);

  let status = map.status;
  if (status === 'mapped' && (views.length < 2 || !cruxes.length)) status = settled.length ? 'settled' : 'none';
  const out = {
    ...map, status, settled,
    views: status === 'mapped' ? views : [], cruxes: status === 'mapped' ? cruxes : [],
    wording: { ...map.wording, leansAwayFrom: map.wording.leansAwayFrom.filter((id) => keep.has(id)) },
    question: q, at: now, live: true,
  };
  await hashUpdate(HASH, { set: { [key]: JSON.stringify(out) }, ttlSeconds: CACHE_TTL_S }).catch((e) => console.warn('[views-demo] cache write failed:', e.message));
  return out;
}
