// Live probe of the Mosaic views mandala: the map, then every ring tapped.
// Store is isolated by MOSAIC_DATA_DIR (set by the runner), so nothing touches
// the production record. Traces every model call, search and link check.
//
// Run:  node viewsprobe.mjs <out.json> [startIndex] [endIndex]
import fs from 'node:fs';
import path from 'node:path';

const APP = new URL('../..', import.meta.url).pathname;
const { mapLive, ringSides } = await import(path.join(APP, 'server/viewsDemo.js'));
const { handleLLM, tavilySearch } = await import(path.join(APP, 'server/proxyCore.js'));
const { linkLoads } = await import(path.join(APP, 'server/viewsDemo.js'));

const OUT = process.argv[2] || 'out.json';
const FROM = Number(process.argv[3] || 0);
const TO = Number(process.argv[4] || 999);

// ---- the question set ------------------------------------------------------
// Six regressions from the 2026-11-23 run, then cases aimed at the new ring
// lookup: an empirical crux with data on both sides, a bare-negation answer,
// the NATO case that forced the titleDenies fix, a long question whose crux
// falls off the 200-character ring search, and a question with no public sides.
const QUESTIONS = [
  { cat: 'settled', q: 'Was the moon landing faked?' },
  { cat: 'settled', q: 'Do vaccines cause autism?' },
  { cat: 'hot', q: 'Was it right for Israel to invade Gaza?' },
  { cat: 'good-case', q: 'Should cities ban cars downtown?' },
  { cat: 'niche', q: 'Is Rust better than Go for backend services?' },
  { cat: 'loaded', q: 'Why is nuclear power so dangerous?' },
  { cat: 'title-denies', q: 'Did NATO expansion provoke Russia’s invasion of Ukraine?' },
  { cat: 'empirical', q: 'Does raising the minimum wage cost jobs?' },
  { cat: 'charged-medical', q: 'Are puberty blockers safe for teenagers?' },
  { cat: 'policy', q: 'Should the UK bring back national service?' },
  { cat: 'empirical', q: 'Is remote work bad for productivity?' },
  { cat: 'origins', q: 'Did the COVID-19 virus come from a laboratory?' },
  { cat: 'long', q: 'I keep reading that social media is the main reason teenage mental health has got worse over the last fifteen years, but other people say the evidence is weak and that it is really about phones in schools and economic insecurity — which is it?' },
  { cat: 'no-sides', q: 'Is taste learnable?' },
];

// ---- tracing ---------------------------------------------------------------
const trace = { llm: [], search: [], check: [] };
let phase = 'map';
const stageOf = (sys) => {
  if (sys.startsWith('You write web searches')) return 'ring-query';
  if (sys.startsWith('You match questions')) return 'ring-pick';
  if (sys.startsWith('You match views')) return 'view-pick';
  if (sys.startsWith('You map the main views')) return 'map';
  return 'other';
};
const llm = async (body, tag) => {
  const sys = body.messages[0].content;
  const t0 = Date.now();
  let res;
  try {
    res = await handleLLM(body, tag);
  } catch (e) {
    res = { status: 0, json: { error: { message: String(e.message) } } };
  }
  trace.llm.push({
    phase, stage: stageOf(sys), status: res.status, ms: Date.now() - t0,
    err: res.status === 200 ? null : String(res.json?.error?.message || '').slice(0, 140),
  });
  return res;
};
const search = async (query, opts = {}) => {
  const t0 = Date.now();
  let rs = [];
  let err = null;
  try {
    rs = await tavilySearch(query, opts);
  } catch (e) { err = String(e.message).slice(0, 140); }
  trace.search.push({
    phase, query, ms: Date.now() - t0, n: rs.length, err,
    excluded: (opts.excludeDomains || []).length,
    results: rs.map((r) => ({ title: r.title, url: r.url, snippet: String(r.snippet || '').slice(0, 400), published: r.published || '' })),
  });
  return rs;
};
const check = async (url) => {
  const t0 = Date.now();
  const ok = await linkLoads(url);
  trace.check.push({ phase, url, ok, ms: Date.now() - t0 });
  return ok;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Exactly what src/viewsdemo/ringSides.js sends for one ring.
const ringPayload = (map, k) => {
  const c = map.cruxes[k];
  return {
    question: map.question,
    crux: { question: c.question, left: c.left, right: c.right },
    holders: Object.fromEntries(['left', 'right'].map((pos) => [pos, (map.views || [])
      .filter((v) => c.positions?.[v.id] === pos)
      .map((v) => `${v.name}: ${v.summary || ''}`.slice(0, 160))])),
    have: (c.reading || []).map((s) => s.url),
  };
};

const results = [];
const write = () => fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));

for (let i = FROM; i < Math.min(TO, QUESTIONS.length); i++) {
  const { q, cat } = QUESTIONS[i];
  const rec = { i, cat, q, map: null, rings: [], llm: [], search: [], check: [], error: null, tries: 0, ms: 0 };
  trace.llm = []; trace.search = []; trace.check = [];
  phase = 'map';
  const t0 = Date.now();
  console.error(`\n[${i}] ${cat} :: ${q}`);
  try {
    // The client asks again on { pending: true }, up to four times.
    let out = null;
    for (let t = 0; t < 4; t++) {
      rec.tries = t + 1;
      out = await mapLive(q, { ip: 'probe', unlimited: true, llm, search, check });
      if (!out?.pending) break;
      console.error(`    pending, asking again (try ${t + 2})`);
      await sleep(3000);
    }
    rec.map = out;
    if (out?.pending) rec.error = 'still pending after 4 tries';
  } catch (e) {
    rec.error = `${e.type || 'error'}: ${e.message}`;
    console.error(`    map failed: ${rec.error}`);
  }
  rec.ms = Date.now() - t0;
  const map = rec.map;
  // Tap every ring, the way a reader does: the lookup fires when a shown side
  // has fewer than two checked articles.
  if (map?.status === 'mapped' && map.cruxes?.length) {
    for (let k = 0; k < map.cruxes.length; k++) {
      phase = `ring${k}`;
      const c = map.cruxes[k];
      const checkedN = (pos) => (c.reading || []).filter((r) => r.side === pos).length;
      const short = { left: checkedN('left') < 2, right: checkedN('right') < 2 };
      const entry = { k, question: c.question, left: c.left, right: c.right, checked: { left: checkedN('left'), right: checkedN('right') }, short, fired: false, reading: null, error: null, ms: 0 };
      if (short.left || short.right) {
        entry.fired = true;
        const payload = ringPayload(map, k);
        entry.payload = payload;
        const s0 = Date.now();
        try {
          const r = await ringSides(payload, { ip: 'probe', unlimited: true, llm, search, check });
          entry.reading = r.reading;
          entry.cached = !!r.cached;
        } catch (e) {
          entry.error = `${e.type || 'error'}: ${e.message}`;
        }
        entry.ms = Date.now() - s0;
        console.error(`    ring ${k + 1}/${map.cruxes.length} "${c.question.slice(0, 60)}" → ${entry.error ? `ERR ${entry.error}` : `${entry.reading.length} pieces (L${entry.reading.filter((x) => x.side === 'left').length} R${entry.reading.filter((x) => x.side === 'right').length})`} ${entry.ms}ms`);
      }
      rec.rings.push(entry);
    }
  }
  rec.llm = trace.llm.slice(); rec.search = trace.search.slice(); rec.check = trace.check.slice();
  const n429 = rec.llm.filter((x) => x.status === 429).length;
  console.error(`    done: ${map?.status || 'ERR'}${map?.thin ? ' (thin)' : ''} · ${rec.llm.length} model calls, ${n429} were 429 · ${rec.search.length} searches · ${Math.round(rec.ms / 1000)}s map`);
  results.push(rec);
  write();
  await sleep(4000);
}
write();
console.error(`\nWrote ${OUT}`);
