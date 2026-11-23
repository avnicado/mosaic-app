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
const THIN_TTL_S = 10 * 60;
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

// A page that debunks a claim states that claim before refuting it, and a
// search snippet carries both. The model read such a sentence as the page's own
// argument and cited National Geographic and TIME as arguing the moon landing
// was staged. So: when a page reads as a refutation, a pick from it is kept
// only if what it is said to argue reads as a refutation too. This drops some
// good mainstream sources as well; a wrong attribution costs more.
// Two lists, not one. The page side is broad, because on a settled question
// the topic words themselves ("hoax", "conspiracy") mark a page as being about
// the claim rather than for it. The line side must be narrow: those same topic
// words appear in a line that states the claim ("Hoax believers say the
// reflections come from studio lights"), and a shared list would wave it past.
const PAGE_REFUTES = /\b(debunk\w*|fact[- ]check\w*|conspiracy|conspiracies|hoax\w*|no evidence|false claim\w*|myth\w*|misleading|not true|disproven)\b/i;
const SAYS_REFUTES = /\b(debunk\w*|fact[- ]check\w*|no evidence|false claim\w*|not true|disproven|is a myth|was never)\b/i;
export function reportedNotArgued(result, says) {
  let path = '';
  try { path = new URL(result?.url || '').pathname.replace(/[-_/]+/g, ' '); } catch {}
  const page = `${result?.title || ''} ${result?.snippet || ''} ${path}`;
  return PAGE_REFUTES.test(page) && !SAYS_REFUTES.test(String(says || ''));
}

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
  const key = `v5:${hashString(norm(q))}`; // v5: the picking guards changed what a map may contain

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
  // A quote counts only when every piece of it is in the result's own text. An
  // elided quote ("a … b") used to pass on its first 60 characters alone, which
  // let a made-up second half through.
  const quoteOf = (p, r) => {
    const quote = String(p?.quote || '').replace(/\s+/g, ' ').trim();
    if (!quote) return '';
    const hay = String(r.snippet || '').replace(/\s+/g, ' ');
    const parts = quote.split(/\s*(?:\.\.\.|…)\s*/).map((s) => s.trim()).filter((s) => s.length >= 8);
    return parts.length && parts.every((s) => hay.includes(s)) ? quote.slice(0, 200) : '';
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
        if (reportedNotArgued(r, text || '')) continue;
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
        if (!says || reportedNotArgued(r, says)) continue;
        const src = { ...srcOf(p, r), side, says };
        g.crux.reading.push(src);
        picked.push(src);
      }
    } catch (e) {
      console.warn('[views-demo] picking ring sources failed:', e.message);
    }
  };
  // One after the other, not side by side: run together they collided on the
  // Groq rate limit and one of the two was regularly lost, which left a map
  // with no sources at all.
  await pickViews();
  await pickRings();
  // Every picked page must open.
  const ok = await Promise.all(picked.map((s) => check(s.url)));
  const dead = new Set(picked.filter((_, i) => !ok[i]).map((s) => s.url));
  for (const g of groups) g.ref.reasons = g.ref.reasons.filter((x) => !dead.has(x.sources[0].url));
  for (const g of rings) g.crux.reading = g.crux.reading.filter((x) => !dead.has(x.url));

  // Sourcing no longer decides which views survive. It used to: unsourced views
  // were dropped whenever two sourced ones remained and still split. That is
  // unsafe now that a picked page can be refused by the guard above. On a
  // settled question the mainstream view's sources are the ones most often
  // refused (a debunking page cited for it reads as a refutation), so the rule
  // could delete the consensus slice and leave only the denial views. An
  // unsourced view instead loses its "held by" line in the UI, and a map with
  // no source at all is thin.
  const cruxesFor = (vs) => {
    const ids = new Set(vs.map((v) => v.id));
    return map.cruxes
      .map((c) => ({ ...c, positions: Object.fromEntries(Object.entries(c.positions).filter(([id]) => ids.has(id))) }))
      .filter((c) => Object.values(c.positions).includes('left') && Object.values(c.positions).includes('right'));
  };
  const views = map.views.map(({ search: _s, ...v }) => v);
  const keep = new Set(views.map((v) => v.id));
  const cruxes = cruxesFor(views);

  let status = map.status;
  let thin = false;
  // A map with no source anywhere is the model's word and nothing else, so it
  // is not worth showing. It happened whenever both picking calls were lost.
  const anySource = views.some((v) => v.reasons.length) || cruxes.some((c) => c.reading.length);
  if (status === 'mapped' && (views.length < 2 || !cruxes.length || !anySource)) { status = 'none'; thin = true; }
  // The headline counts views; make it match the views that survived sourcing.
  const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five'];
  const headline = String(map.headline || '').replace(/^(One|Two|Three|Four|Five|\d) main views/i, `${WORDS[views.length] || views.length} main views`);
  const out = {
    ...map, status, headline,
    views: status === 'mapped' ? views : [], cruxes: status === 'mapped' ? cruxes : [],
    wording: { ...map.wording, leansAwayFrom: map.wording.leansAwayFrom.filter((id) => keep.has(id)) },
    question: q, at: now, live: true, ...(thin ? { thin: true } : {}),
  };
  // A thin verdict is often a passing failure (a lost model call), so it is
  // held only briefly: long enough that a second click costs nothing, short
  // enough that trying again later still runs.
  await hashUpdate(HASH, { set: { [key]: JSON.stringify(out) }, ttlSeconds: thin ? THIN_TTL_S : CACHE_TTL_S })
    .catch((e) => console.warn('[views-demo] cache write failed:', e.message));
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
  // The views that give each answer, in their own words ("name: summary"):
  // what makes a search land on pages making that case rather than on the
  // most-read pages on the topic.
  const holders = (pos) => (Array.isArray(input?.holders?.[pos]) ? input.holders[pos] : []).slice(0, 3).map((h) => s(h, 160)).filter(Boolean).join(' ');
  if (q.length < 6 || crux.question.length < 6 || !crux.left || !crux.right) throw fail(400, 'bad_request', 'Missing the ring’s question or answers.');
  const have = new Set((Array.isArray(input?.have) ? input.have : []).slice(0, 20).map(String));
  const key = `r7:${hashString([q, crux.question, crux.left, crux.right, holders('left'), holders('right')].map(norm).join('|'))}`;
  const cached = input?.debugCandidates ? null : await hashGet(HASH, key).catch(() => null);
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
  // Content farms re-post others' articles under a "(2026)"-style title.
  const copied = (r) => /\((19|20)\d\d\)\s*$/.test(String(r.title || '').trim()) && !/\.(gov|edu)$/.test(hostOf(r.url));
  // A fact-check page states a claim to refute it, so it never argues an answer;
  // left in, it crowds out the pages that do on any contested side.
  const NOT_ARGUING = ['factcheck.org', 'factcheck.afp.com', 'snopes.com', 'politifact.com', 'fullfact.org', 'healthfeedback.org', 'science.feedback.org', 'leadstories.com', 'tavily.com'];
  // A search for the answer's bare words lands on the most-read pages on the
  // topic, which on a contested question mostly argue one side. So the model
  // first writes, for each answer, the search its own advocates' pages would
  // match, in their words (no names: a name finds pages about those people,
  // often fact-checks). On failure, the question and answer as they stand.
  let queries = {};
  try {
    const out = await groqJSON({
      system: 'You write web searches. For one QUESTION with two opposite answers, A and B, write for each answer one search (at most 12 words) that would find articles, op-eds, reports or papers by people who argue that answer, phrased the way they themselves would put it. Name no person or organisation. Output ONLY valid JSON: {"A":"...","B":"..."}',
      prompt: `QUESTION: ${crux.question}\nAbout: ${q}\nA: ${crux.left}${holders('left') ? ` (held by: ${holders('left')})` : ''}\nB: ${crux.right}${holders('right') ? ` (held by: ${holders('right')})` : ''}`,
      maxTokens: 400, deadline, llm,
    });
    queries = { left: s(out?.A, 160), right: s(out?.B, 160) };
  } catch (e) {
    console.warn('[views-demo] ring queries failed:', e.message);
  }
  const sideSearch = async (answer, pos) => {
    const query = (queries[pos] && queries[pos].length > 8 ? queries[pos] : `${crux.question} ${answer}. ${holders(pos) || q}`).slice(0, 380);
    try {
      const rs = await search(query, { maxResults: 10, timeoutMs: 9000, excludeDomains: NOT_ARGUING });
      const hosts = new Set();
      return rs.filter(usable).filter((r) => !copied(r)).filter((r) => {
        const h = hostOf(r.url);
        if (hosts.has(h)) return false;
        hosts.add(h);
        return true;
      }).slice(0, 5);
    } catch (e) {
      console.warn('[views-demo] ring search failed:', e.message);
      return [];
    }
  };
  const [a, b] = await Promise.all([sideSearch(crux.left, 'left'), sideSearch(crux.right, 'right')]);
  // Both answers' results side by side in one list, each page once.
  const seen = new Set();
  const results = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const r of [a[i], b[i]]) {
      if (r && !seen.has(r.url)) { seen.add(r.url); results.push(r); }
    }
  }
  const reading = [];
  if (input?.debugCandidates && process.env.VERCEL_ENV !== 'production') { // TEMP: see what the searches return
    return { queries, candidates: { a: a.map((r) => [r.url, r.title]), b: b.map((r) => [r.url, r.title]) } };
  }
  if (results.length) {
    const out = await groqJSON({ system: `${RING_PICK_SYSTEM}\n\nNever pick a page from a site that has nothing to do with the topic and only copies other outlets' articles. A news report of what someone decided or said argues that answer only if the page itself makes the case for it; a report that is critical of it, or only relays it, is not a pick.`, prompt: ringPickPrompt([{ crux, results }]), maxTokens: 1000, deadline, llm });
    for (const p of Array.isArray(out?.picks) ? out.picks : []) {
      const r = results[Number(p?.result) - 1];
      const side = String(p?.side || '').trim().toUpperCase() === 'A' ? 'left' : String(p?.side || '').trim().toUpperCase() === 'B' ? 'right' : null;
      const says = tidyReason(p?.says);
      if (!r || !side || says.length < 12 || reportedNotArgued(r, says) || reading.some((x) => x.url === r.url) || reading.filter((x) => x.side === side).length >= 2) continue;
      const quote = String(p?.quote || '').replace(/\s+/g, ' ').trim();
      const hay = String(r.snippet || '').replace(/\s+/g, ' ');
      const parts = quote.split(/\s*(?:\.\.\.|…)\s*/).map((x) => x.trim()).filter((x) => x.length >= 8);
      reading.push({
        title: String(r.title).slice(0, 200), url: r.url,
        outlet: String(p?.outlet || '').replace(/\s+/g, ' ').trim().slice(0, 80) || hostOf(r.url),
        date: r.published ? String(r.published).slice(0, 7) : '',
        quote: parts.length && parts.every((x) => hay.includes(x)) ? quote.slice(0, 200) : '',
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
