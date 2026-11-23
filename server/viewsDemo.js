// The views page (/views), live path: a typed question mapped on the server.
// Public (no sign-in), so it is capped: per address per hour, and in total
// per day, and every answer is cached so a question is only ever paid for once.
//
//   1 Groq call   maps the question (the views, who holds them, the points they split on)
//   ≤8 searches   one per view and one per split question (Tavily, real results only)
//   2 Groq calls  side by side: one picks, for each view, pieces written by people
//                 who hold it; one picks, for each split question, pieces arguing
//                 each answer. Each says in a line what a piece argues; URLs are
//                 never model-written
//   link check    every picked page is opened; one that doesn't load is dropped
//
// Store: m2:views-demo  "v:<hash>" → JSON map   "d:<day>" / "ip:<ip>:<hour>" → counts

import { handleLLM, tavilySearch, hasSearchKey, hasKey } from './proxyCore.js';
import { claudeFallbackOn } from './claudeCli.js';
import { hashGet, hashUpdate, hashIncr } from './store.js';
import { safeResultUrl } from './further.js';
import { hashString } from './corpus.js';
import { parseJSON, suggestedWaitMs } from '../src/engine/llm.js';
import { MAP_SYSTEM, PICK_SYSTEM, RING_PICK_SYSTEM, mapPrompt, pickPrompt, ringPickPrompt, normalizeMap, hostOf } from '../src/engine/viewsDemo.js';

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

const BAD_HOST = /(^|\.)(pinterest|facebook|instagram|tiktok|x|twitter|quora|amazon|ebay|linkedin|mapquest|yelp|yellowpages|tripadvisor|bbb|manta|zoominfo|crunchbase|glassdoor|indeed|reddit)\.(com|org)$/;
// A listing, map or directory page, not an argument: "…, Springfield, IL 62704 - MapQuest".
const LISTING_TITLE = /\b\d{5}(-\d{4})?\b.*\b(US|USA)\b|\b(MapQuest|Yelp|Yellow Pages|Phone Number)\b/i;
const usable = (r) => r?.url && safeResultUrl(r.url) && !BAD_HOST.test(hostOf(r.url)) && (r.title || '').trim().length >= 8 && !LISTING_TITLE.test(r.title || '') && (r.snippet || '').trim().length >= 40;

// "The page states that X" → "X": a reason is the view's own point, not a note about a page.
export function tidyReason(v) {
  let t = String(v || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(the|this) (page|article|study|review|report|piece|post|site|association|author|organi[sz]ation)\s+(states|says|argues|claims|shows|finds|notes|explains|suggests|contends)( that)?\s*/i, '');
  if (t) t = t[0].toUpperCase() + t.slice(1);
  return t.slice(0, 280);
}

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
  const key = `v4:${hashString(norm(q))}`;

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

  // Search for each view and each split question, then let the model pick pages
  // and say what each argues.
  const groups = map.views.map((v) => ({ label: `"${v.name}": ${v.summary}`, search: v.search, ref: v }));
  const rings = map.cruxes.map((c) => ({ crux: c, search: `${c.question} ${map.question}`.slice(0, 200) }));
  const all = await searchAll([...groups, ...rings], search);
  const results = all.slice(0, groups.length);
  groups.forEach((g, i) => { g.results = results[i]; g.ref.reasons = []; g.ref.sources = []; });
  rings.forEach((g, i) => { g.results = all[groups.length + i]; g.crux.reading = []; });
  const quoteOf = (p, r) => {
    const quote = String(p?.quote || '').replace(/\s+/g, ' ').trim();
    return quote && String(r.snippet || '').replace(/\s+/g, ' ').includes(quote.slice(0, 60)) ? quote.slice(0, 200) : '';
  };
  const srcOf = (p, r) => ({
    title: String(r.title).slice(0, 200), url: r.url, outlet: String(p?.outlet || '').replace(/\s+/g, ' ').trim().slice(0, 80) || hostOf(r.url),
    author: '', date: r.published ? String(r.published).slice(0, 7) : '', quote: quoteOf(p, r),
  });
  const picked = [];
  const timeLeft = () => Date.now() < deadline - 12_000;
  const pickViews = async () => {
    if (!results.some((r) => r.length) || !timeLeft()) return;
    try {
      const out = await groqJSON({ system: PICK_SYSTEM, prompt: pickPrompt(groups), maxTokens: 1100, deadline, llm });
      for (const p of Array.isArray(out?.picks) ? out.picks : []) {
        const g = groups[Number(p?.group) - 1];
        const r = g?.results?.[Number(p?.result) - 1];
        if (!g || !r || g.ref.reasons.some((x) => x.sources[0].url === r.url) || g.ref.reasons.length >= 2) continue;
        const src = srcOf(p, r);
        const text = tidyReason(p.reason);
        g.ref.reasons.push({ text: text || (src.quote ? `“${src.quote}”` : `Makes the case at ${src.outlet}.`), sources: [src] });
        picked.push(src);
      }
    } catch (e) {
      console.warn('[views-demo] picking sources failed:', e.message);
    }
  };
  const pickRings = async () => {
    if (!rings.some((g) => g.results.length) || !timeLeft()) return;
    try {
      const out = await groqJSON({ system: RING_PICK_SYSTEM, prompt: ringPickPrompt(rings), maxTokens: 1100, deadline, llm });
      for (const p of Array.isArray(out?.picks) ? out.picks : []) {
        const g = rings[Number(p?.group) - 1];
        const r = g?.results?.[Number(p?.result) - 1];
        const side = String(p?.side || '').trim().toUpperCase() === 'A' ? 'left' : String(p?.side || '').trim().toUpperCase() === 'B' ? 'right' : null;
        if (!g || !r || !side || g.crux.reading.some((x) => x.url === r.url) || g.crux.reading.filter((x) => x.side === side).length >= 2) continue;
        const says = tidyReason(p.says);
        if (!says) continue;
        const src = { ...srcOf(p, r), side, says };
        g.crux.reading.push(src);
        picked.push(src);
      }
    } catch (e) {
      console.warn('[views-demo] picking ring sources failed:', e.message);
    }
  };
  await Promise.all([pickViews(), pickRings()]);
  // Every picked page must open.
  const ok = await Promise.all(picked.map((s) => check(s.url)));
  const dead = new Set(picked.filter((_, i) => !ok[i]).map((s) => s.url));
  for (const g of groups) g.ref.reasons = g.ref.reasons.filter((x) => !dead.has(x.sources[0].url));
  for (const g of rings) g.crux.reading = g.crux.reading.filter((x) => !dead.has(x.url));

  // Views must stand on real pieces: keep only sourced views, when enough are.
  // If the sourced views alone no longer disagree on anything, keep them all.
  const cruxesFor = (vs) => {
    const ids = new Set(vs.map((v) => v.id));
    return map.cruxes
      .map((c) => ({ ...c, positions: Object.fromEntries(Object.entries(c.positions).filter(([id]) => ids.has(id))) }))
      .filter((c) => Object.values(c.positions).includes('left') && Object.values(c.positions).includes('right'));
  };
  let views = map.views;
  const sourced = views.filter((v) => v.reasons.length);
  if (sourced.length >= 2 && cruxesFor(sourced).length) views = sourced;
  views = views.map(({ search: _s, ...v }) => v);
  const keep = new Set(views.map((v) => v.id));
  const cruxes = cruxesFor(views);

  let status = map.status;
  let thin = false;
  if (status === 'mapped' && (views.length < 2 || !cruxes.length)) { status = 'none'; thin = true; }
  // The headline counts views; make it match the views that survived sourcing.
  const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];
  const headline = String(map.headline || '').replace(/^(One|Two|Three|Four|Five|\d) main views/i, `${WORDS[views.length] || views.length} main views`);
  const out = {
    ...map, status, headline,
    views: status === 'mapped' ? views : [], cruxes: status === 'mapped' ? cruxes : [],
    wording: { ...map.wording, leansAwayFrom: map.wording.leansAwayFrom.filter((id) => keep.has(id)) },
    question: q, at: now, live: true, ...(thin ? { thin: true } : {}),
  };
  if (!thin) await hashUpdate(HASH, { set: { [key]: JSON.stringify(out) }, ttlSeconds: CACHE_TTL_S }).catch((e) => console.warn('[views-demo] cache write failed:', e.message));
  return out;
}

// ---- pieces on one ring's question, from each answer's side ----
// A ring tapped with too few checked articles: one search per answer
// ("<question> <answer>"), then one Groq call that keeps only results arguing
// answer A or B and says in a line what each argues (URLs never model-written),
// every kept page opened. Cached per (question, ring, answers), so a ring is
// paid for once. Capped per address and per day like the map itself.
export const RING_PER_DAY = Number(process.env.VIEWS_RING_PER_DAY || 300);
export const RING_PER_HOUR_PER_IP = Number(process.env.VIEWS_RING_PER_HOUR || 40);

export async function ringSides(input, {
  ip = 'unknown', now = Date.now(), llm = handleLLM,
  search = hasSearchKey() ? tavilySearch : null, check = linkLoads,
} = {}) {
  const s = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const q = s(input?.question, 300);
  const crux = { question: s(input?.crux?.question, 240), left: s(input?.crux?.left, 120), right: s(input?.crux?.right, 120) };
  if (q.length < 6 || crux.question.length < 6 || !crux.left || !crux.right) throw fail(400, 'bad_request', 'Missing the ring’s question or answers.');
  const have = new Set((Array.isArray(input?.have) ? input.have : []).slice(0, 20).map(String));
  const key = `r1:${hashString([q, crux.question, crux.left, crux.right].map(norm).join('|'))}`;
  const cached = await hashGet(HASH, key).catch(() => null);
  if (cached) {
    try { const out = JSON.parse(cached); return { ...out, reading: out.reading.filter((x) => !have.has(x.url)), cached: true }; } catch {}
  }
  if (!search || !(hasKey() || claudeFallbackOn() || llm !== handleLLM)) {
    throw fail(503, 'live_off', 'Finding pieces is not switched on here yet.');
  }
  const hour = new Date(now).toISOString().slice(0, 13);
  const mine = await hashIncr(HASH, `rip:${ip}:${hour}`, 1, 2 * 24 * 3600).catch(() => 0);
  if (mine > RING_PER_HOUR_PER_IP) throw fail(429, 'views_rate', 'That’s a lot of rings in an hour. Try again a little later.');
  const used = await hashIncr(HASH, `rd:${hour.slice(0, 10)}`, 1, 3 * 24 * 3600).catch(() => 0);
  if (used > RING_PER_DAY) throw fail(429, 'views_daily_cap', 'Enough rings have been looked up today. Try again tomorrow.');

  const deadline = now + DEADLINE_MS;
  const [a, b] = await searchAll([
    { search: `${crux.question} ${crux.left} ${q}`.slice(0, 250) },
    { search: `${crux.question} ${crux.right} ${q}`.slice(0, 250) },
  ], search);
  // Both answers' results side by side in one list, each page once.
  const seen = new Set();
  const results = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const r of [a[i], b[i]]) {
      if (r && !seen.has(r.url)) { seen.add(r.url); results.push(r); }
    }
  }
  const reading = [];
  if (results.length) {
    const out = await groqJSON({ system: RING_PICK_SYSTEM, prompt: ringPickPrompt([{ crux, results }]), maxTokens: 1000, deadline, llm });
    for (const p of Array.isArray(out?.picks) ? out.picks : []) {
      const r = results[Number(p?.result) - 1];
      const side = String(p?.side || '').trim().toUpperCase() === 'A' ? 'left' : String(p?.side || '').trim().toUpperCase() === 'B' ? 'right' : null;
      const says = tidyReason(p?.says);
      if (!r || !side || says.length < 12 || reading.some((x) => x.url === r.url) || reading.filter((x) => x.side === side).length >= 2) continue;
      const quote = String(p?.quote || '').replace(/\s+/g, ' ').trim();
      reading.push({
        title: String(r.title).slice(0, 200), url: r.url,
        outlet: String(p?.outlet || '').replace(/\s+/g, ' ').trim().slice(0, 80) || hostOf(r.url),
        date: r.published ? String(r.published).slice(0, 7) : '',
        quote: quote && String(r.snippet || '').replace(/\s+/g, ' ').includes(quote.slice(0, 60)) ? quote.slice(0, 200) : '',
        side, says,
      });
    }
  }
  const ok = await Promise.all(reading.map((x) => check(x.url)));
  const live = reading.filter((_, i) => ok[i]);
  const out = { reading: live, at: now };
  if (live.length) await hashUpdate(HASH, { set: { [key]: JSON.stringify(out) }, ttlSeconds: CACHE_TTL_S }).catch((e) => console.warn('[views-demo] ring cache write failed:', e.message));
  return { ...out, reading: live.filter((x) => !have.has(x.url)) };
}
