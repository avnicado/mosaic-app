// Headless check of "looking further" (server/further.js, /api/further, and the
// extras /api/corpus serves). Upstreams are stubbed: Tavily and Groq answer
// from canned data, and any other network call fails the test, which also
// proves no result page is ever fetched. Uses a throwaway file store.
//   node scripts/further-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mosaic-further-'));
process.env.MOSAIC_DATA_DIR = dir;
process.env.TAVILY_API_KEY = 'test-tavily';
process.env.GROQ_API_KEY = 'test-groq';
process.env.LLM_FALLBACK = 'off';
delete process.env.VERCEL; delete process.env.APP_PASSWORD; delete process.env.PERSPECTIVE_API_KEY;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

// ---- stubbed upstreams ----------------------------------------------------------
const calls = { tavily: [], groq: 0, other: [] };
let tavilyMode = 'ok', groqMode = 'ok', tavilyDelay = 0, groqDelay = 0;
const article = (slug, title, extra = {}) => ({
  url: `https://www.example-journal.org/essays/${slug}`, title,
  content: `A long, careful piece about ${title.toLowerCase()}, with field notes, interviews and the evidence behind it, written for curious readers.`,
  score: 0.8, ...extra,
});
const RESULTS = [
  article('mending-a-chair', 'Mending a hundred-year-old chair, joint by joint'),
  article('repair-cafes', 'What repair cafés taught a town about fixing things'),
  article('mending-a-chair?utm_source=x', 'Mending a hundred-year-old chair, joint by joint (again)'), // dup after normalising
  { url: 'https://www.pinterest.com/pin/123', title: 'Repair ideas board on Pinterest', content: 'x'.repeat(80), score: 0.9 },
  { url: 'https://craftblog.example.net/', title: 'The Craft Blog home page here', content: 'y'.repeat(80), score: 0.7 },
  { url: 'https://listy.example.net/top-10-repair-hacks', title: 'Top 10 repair hacks you need', content: 'z'.repeat(80), score: 0.7 },
  { url: 'http://192.168.1.4/repair', title: 'An internal page about repair', content: 'w'.repeat(80), score: 0.7 },
  { url: 'https://user:pw@example-journal.org/x', title: 'A page with credentials in it', content: 'v'.repeat(80), score: 0.7 },
  { url: 'https://quanta.example.org/already-here', title: 'Already in the morning pool, an essay', content: 'u'.repeat(80), score: 0.7 },
  article('rage', 'Why repair idiots destroy everything, shocking', { content: 'You won’t believe how these idiots slams and destroys, furious hate.' }),
];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.tavily.com/search') {
    const body = JSON.parse(init.body);
    calls.tavily.push(body);
    if (tavilyDelay) await new Promise((r) => setTimeout(r, tavilyDelay));
    if (tavilyMode === 'down') return new Response(JSON.stringify({ detail: 'down' }), { status: 500 });
    // Each query gets the same mix, plus one result of its own.
    const own = article(`q${calls.tavily.length}`, `A field study of ${body.query.slice(-30)} in practice`);
    return new Response(JSON.stringify({ results: [...RESULTS, own] }), { status: 200 });
  }
  if (u === 'https://api.groq.com/openai/v1/chat/completions') {
    calls.groq++;
    if (groqDelay) await new Promise((r) => setTimeout(r, groqDelay));
    if (groqMode === 'down') return new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
    const prompt = JSON.parse(init.body).messages[0].content;
    const rage = /idiots/.test(prompt);
    const content = JSON.stringify({
      domain: 'craft & making', part: 'repair', moveType: 'ground',
      bridging: rage ? 0.1 : 0.72, density: 0.62, why: 'A concrete case of mending as a practice.',
    });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  }
  calls.other.push(u);
  throw new Error(`unexpected fetch in test: ${u}`);
};

const { lookFurther: lookFurtherReal, buildQueries, junkReason, safeResultUrl, searchable, readExtras, mergeExtras, normUrl, USER_PER_HOUR, SCORE_MAX } = await import('../server/further.js');
// Lengths: the real measurer fetches result pages; here a stub stands in, so
// the test still proves nothing else is fetched. It measures every other find.
const measured = [];
const stubMeasure = async (items) => { items.forEach((it, i) => { measured.push(it.url); if (i % 2 === 0) { it.minutes = 7 + i; it.length_by = 'page'; } }); return items.length; };
const lookFurther = (u, l, o = {}) => lookFurtherReal(u, l, { measure: stubMeasure, ...o });
const { setBlob } = await import('../server/store.js');
const { cleanLean, emptyLean, composeLeanShelf, inLeanArea, LEAN_SHELF_SIZE } = await import('../src/scoring.js');
const { ROUTES } = await import('../api/[route].js');

const L = (o) => cleanLean({ ...emptyLean(), ...o });

// ---- queries --------------------------------------------------------------------
{
  const q1 = buildQueries(L({ fields: ['craft & making'], parts: { 'craft & making': ['repair'] } }));
  check('one part → two queries (an essay, then talks)', q1.length === 2 && q1.every((q) => q.field === 'craft & making' && q.part === 'repair') && /repair \(craft & making\)/.test(q1[0].q) && /talk|lecture|interview|podcast/.test(q1[1].q), JSON.stringify(q1));
  const q2 = buildQueries(L({ fields: ['history', 'science'], parts: { history: ['industry', 'everyday life'] }, ring: 4, mood: null }));
  check('parts and fields → at most three queries', q2.length === 3 && q2[0].part === 'industry' && q2[2].field === 'science', JSON.stringify(q2));
  check('depth shapes the query', /rigorous/.test(q2[0].q));
  const q3 = buildQueries(L({ fields: ['nature & environment'], mood: 'ground', hunch: 'lichen on old walls' }));
  check('mood and hunch shape the query', /case study/.test(q3[0].q) && /lichen on old walls/.test(q3[0].q), q3[0].q);
  const q4 = buildQueries(L({ hunch: 'why maps lie' }));
  check('a hunch alone is searchable', q4.length === 2 && q4[0].q.includes('why maps lie') && q4[0].field === null);
  check('depth or mood alone is not searchable', !searchable(L({ ring: 2 })) && !searchable(L({ mood: 'bridge' })));
  check('a bad lean is cleaned', cleanLean({ fields: ['nope', 'history', 'history'], parts: { history: ['industry', 'x'] }, ring: 9, mood: 'rage', hunch: 5 }).fields.join() === 'history'
    && cleanLean({ fields: ['history'], parts: { history: ['industry', 'x'] } }).parts.history.join() === 'industry');
}

// ---- quality and addresses ----------------------------------------------------------
{
  const ok = { url: 'https://example-journal.org/essays/a-real-piece', title: 'A real piece about mending', snippet: 'p'.repeat(80) };
  check('a real article passes', junkReason(ok) === '');
  check('Pinterest is kept out, in any country', junkReason({ ...ok, url: 'https://www.pinterest.co.uk/pin/1' }) === 'site' && junkReason({ ...ok, url: 'https://de.pinterest.com/pin/1' }) === 'site');
  check('a home page is kept out', junkReason({ ...ok, url: 'https://example-journal.org/' }) === 'homepage');
  check('a listicle is kept out', junkReason({ ...ok, title: 'The 12 best ways to fix a chair' }) === 'listicle');
  check('a tag page is kept out', junkReason({ ...ok, url: 'https://example-journal.org/tag/repair' }) === 'listing');
  check('IP, localhost, internal and credentialled addresses are refused',
    !safeResultUrl('http://10.0.0.1/a') && !safeResultUrl('http://[::1]/a') && !safeResultUrl('http://localhost/a')
    && !safeResultUrl('https://wiki.corp/a') && !safeResultUrl('https://a:b@example.org/x') && !safeResultUrl('ftp://example.org/x')
    && !safeResultUrl('https://example.org:8080/x') && safeResultUrl('https://example.org/x'));
  check('tracking parameters do not make a new page', normUrl('https://www.a.org/x/?utm_source=y#top') === normUrl('https://a.org/x'));
}

// ---- the day's pool -----------------------------------------------------------------
const generatedAt = new Date().toISOString();
const morning = {
  meta: { generatedAt, count: 2, sources: ['Quanta Magazine'] },
  items: [
    { id: 'a', title: 'Already in the morning pool, an essay', url: 'https://quanta.example.org/already-here', source: 'Quanta', domain: 'science', part: 'life', slot: 'sharpen', scores: { bridging: 0.8, density: 0.5, engagement: 1 } },
    { id: 'b', title: 'Bowls and lathes', url: 'https://example.org/bowls', source: 'Colossal', domain: 'craft & making', part: 'tools', slot: 'ground', scores: { bridging: 0.8, density: 0.5, engagement: 1 } },
  ],
};
await setBlob('corpus', JSON.stringify(morning));
const owner = { id: 'owner', name: 'owner', role: 'owner' };
const repairLean = L({ fields: ['craft & making'], parts: { 'craft & making': ['repair'] } });

check('before: the repair lean is thin', composeLeanShelf(morning.items, repairLean).picks.length === 0);

tavilyDelay = 300; groqDelay = 400; // roughly real-world latencies, to see the wait
const r1 = await lookFurther(owner, repairLean);
tavilyDelay = 0; groqDelay = 0;
check('a thin lean searches twice', r1.searched && calls.tavily.length === 2 && r1.calls.search === 2, JSON.stringify(r1.calls));
check('junk domains go to Tavily as exclusions', calls.tavily.every((b) => b.exclude_domains?.includes('pinterest.com') && b.search_depth === 'basic' && b.max_results === 8));
check('Groq calls stay within the cap', calls.groq <= SCORE_MAX && r1.calls.llm === calls.groq, `${calls.groq}`);
check('no result page was fetched', calls.other.length === 0, calls.other.join(', '));
const urls = r1.items.map((i) => i.url);
check('good finds are kept, junk and repeats are not', r1.added >= 3 && urls.every((u) => /example-journal\.org\/essays\//.test(u)) && new Set(urls.map(normUrl)).size === urls.length && !urls.some((u) => /rage|already-here/.test(u)), JSON.stringify(urls));
check('ragebait falls below the bridging floor', r1.skipped['below-floor'] >= 1 && !urls.some((u) => u.includes('rage')), JSON.stringify(r1.skipped));
check('each find is scored, placed and labelled', r1.items.every((i) => i.domain === 'craft & making' && i.part === 'repair' && i.scored_by === 'llm' && i.found_by === 'search' && i.engagementModeled && typeof i.scores.density === 'number' && !('_hint' in i)));
check('every find has a length, measured or estimated', r1.items.every((i) => i.minutes > 0 && ['page', 'estimate'].includes(i.length_by)) && r1.items.some((i) => i.length_by === 'page') && measured.length > 0, JSON.stringify(r1.items.map((i) => [i.minutes, i.length_by])));
check('the finds fit the lean', r1.fit === r1.added && r1.items.every((i) => inLeanArea(i, repairLean)));
console.log(`     wait with stubbed latencies (Tavily 0.3s, Groq 0.4s): ${(r1.ms / 1000).toFixed(1)}s; ${r1.calls.search} searches, ${r1.calls.llm} Groq calls`);

const extras = await readExtras(generatedAt);
check('the finds are in the day’s pool in the store', extras.length === r1.added);
const merged = mergeExtras(morning.items, extras);
check('the shelf for the lean now fills', composeLeanShelf(merged, repairLean).picks.length === Math.min(LEAN_SHELF_SIZE, r1.added));
check('merging twice adds nothing', mergeExtras(merged, extras).length === merged.length);

// The same lean again (anyone): answered from the store, no new calls.
const before = { t: calls.tavily.length, g: calls.groq };
const r2 = await lookFurther({ id: 'someone', name: 'x', role: 'member' }, { ...repairLean, hunch: '' });
check('a lean already searched today costs nothing', !r2.searched && calls.tavily.length === before.t && calls.groq === before.g && r2.items.length === r1.added);

// ---- the routes -------------------------------------------------------------------------
const fakeRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
};
{
  const res = fakeRes();
  await ROUTES.corpus({ method: 'GET', query: {}, headers: {} }, res);
  check('/api/corpus serves the finds with the morning pool', res.code === 200 && res.body.items.length === morning.items.length + r1.added && res.body.meta.found === r1.added, `${res.code} ${res.body?.items?.length}`);
}
{
  const res = fakeRes();
  await ROUTES.further({ method: 'POST', query: {}, headers: {}, body: { lean: { fields: ['history'], parts: { history: ['letters & archives'] } } } }, res);
  check('/api/further answers a new lean', res.code === 200 && res.body.searched && res.body.added > 0, `${res.code} ${JSON.stringify(res.body).slice(0, 200)}`);
  const bad = fakeRes();
  await ROUTES.further({ method: 'POST', query: {}, headers: {}, body: { lean: { ring: 2 } } }, bad);
  check('/api/further refuses a lean with nothing to search', bad.code === 400 && bad.body.error.type === 'nothing_to_search');
  const get = fakeRes();
  await ROUTES.further({ method: 'GET', query: {}, headers: {} }, get);
  check('/api/further is POST only', get.code === 405);
}

// ---- when the scorer is down: the searched field stands in --------------------------------
groqMode = 'down';
const r3 = await lookFurther(owner, L({ fields: ['sport & play'], parts: { 'sport & play': ['running & endurance'] } }));
groqMode = 'ok';
check('with Groq down, finds still score (heuristic) under the searched field', r3.added > 0 && r3.items.every((i) => i.scored_by === 'heuristic' && i.domain === 'sport & play' && i.part === 'running & endurance' && ['search', 'keywords'].includes(i.part_by)), JSON.stringify(r3.items.map((i) => [i.domain, i.part, i.part_by])));

// ---- when the search is down -----------------------------------------------------------
tavilyMode = 'down';
let err = null;
try { await lookFurther(owner, L({ fields: ['math & abstraction'] })); } catch (e) { err = e; }
check('a search outage is a 502, not a crash', err?.status === 502 && err?.type === 'search_upstream', err?.message);
tavilyMode = 'ok';
delete process.env.TAVILY_API_KEY;
err = null;
try { await lookFurther({ id: 'nokey', name: 'n', role: 'member' }, L({ fields: ['math & abstraction'], parts: { 'math & abstraction': ['puzzles & play'] } })); } catch (e) { err = e; }
check('no Tavily key is a 503', err?.status === 503 && err?.type === 'no_search_key', err?.message);
process.env.TAVILY_API_KEY = 'test-tavily';

// ---- per-person limit ------------------------------------------------------------------
{
  const u = { id: 'busy', name: 'b', role: 'member' };
  const fields = ['science', 'technology', 'history', 'health & mind', 'arts & culture', 'society & politics', 'business & economics', 'philosophy & ideas'];
  let n = 0, limited = null;
  for (const f of fields) {
    try { await lookFurther(u, L({ fields: [f], ring: 0 })); n++; } catch (e) { limited = e; break; }
  }
  check(`one person gets ${USER_PER_HOUR} searches an hour`, n === USER_PER_HOUR && limited?.status === 429 && limited?.type === 'rate_limited', `${n} ${limited?.message}`);
  // A lean that was already searched still answers from the store when limited.
  const again = await lookFurther(u, L({ fields: ['science'], ring: 0 }));
  check('a searched lean still answers when the person is limited', !again.searched);
}

globalThis.fetch = realFetch;
fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall further checks passed');
process.exit(failed ? 1 : 0);
