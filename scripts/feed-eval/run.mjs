// Feed eval: run edge-case questions through the REAL pipeline (readThread →
// runFeed: query → Tavily → select) and write a readable report.
//
//   MOSAIC_DATA_DIR=.data npm run dev        # isolated store, never the live record
//   node scripts/feed-eval/run.mjs <label> [--only id,id] [--kind kind] [--conc 2]
//
// Output: scripts/feed-eval/runs/<label>.json (raw) and <label>.md (report).
// The report shows, per case and slot: the search query, what Tavily returned,
// which result was picked and why. Grade it with the rubric in README.md.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setApiBase } from '../../src/engine/llm.js';
import { readThread } from '../../src/engine/thread.js';
import { runFeed } from '../../src/engine/feed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };
const label = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'run';
const BASE = process.env.MOSAIC_URL || 'http://localhost:5200';
const conc = Number(flag('conc') || 2);

// Sign in (owner password from .env) so /api/llm and /api/search accept us.
const envFile = fs.existsSync(path.join(here, '../../.env')) ? fs.readFileSync(path.join(here, '../../.env'), 'utf8') : '';
const password = process.env.APP_PASSWORD || /^APP_PASSWORD=(.*)$/m.exec(envFile)?.[1]?.trim();
let cookie = '';
if (password) {
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '', password }) });
  if (!r.ok) throw new Error('login failed: ' + r.status);
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
}
setApiBase(BASE, cookie ? { cookie } : {});

// Record what search returned for each query, so a report can tell a bad
// QUERY or thin RETRIEVAL apart from a bad SELECTION.
const searches = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const res = await realFetch(url, init);
  if (String(url).endsWith('/api/search') && init?.body) {
    try {
      const q = JSON.parse(init.body).query;
      const data = await res.clone().json();
      searches.set(q, (data.results || []).map((r) => ({ title: r.title, url: r.url, snippet: (r.snippet || '').slice(0, 160) })));
    } catch {}
  }
  return res;
};

let cases = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8'));
if (flag('only')) { const ids = new Set(flag('only').split(',')); cases = cases.filter((c) => ids.has(c.id)); }
if (flag('kind')) cases = cases.filter((c) => c.kind === flag('kind'));

const LISTICLE = /\b(top \d+|\d+ (best|ways|things|tips|reasons)|ultimate guide|everything you need|best of)\b/i;
const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function runCase(c) {
  const t0 = Date.now();
  const out = { ...c };
  try {
    out.reading = await readThread({ question: c.question });
    const items = await runFeed({ question: c.question, reading: out.reading });
    out.items = items.map((it) => ({ ...it, candidates: it.query ? searches.get(it.query) || null : null }));
  } catch (e) { out.error = e.message; out.items = []; }
  out.secs = Math.round((Date.now() - t0) / 1000);
  // cheap mechanical signals; the qualitative grading is done by reading the report
  const ok = out.items.filter((i) => !i.failed);
  const doms = ok.map((i) => domain(i.url));
  out.signals = {
    failedSlots: out.items.filter((i) => i.failed).length,
    knowledgeFallback: ok.filter((i) => i.provenance === 'knowledge').length,
    listicleLooking: ok.filter((i) => LISTICLE.test(i.title) || LISTICLE.test(i.url)).length,
    duplicateDomains: doms.length - new Set(doms).size,
    unknownLink: ok.filter((i) => i.linkCheck === 'unknown').length,
    thinSearch: out.items.filter((i) => i.candidates && i.candidates.length < 4).length,
    mediaTypes: [...new Set(ok.map((i) => i.mediaType))],
  };
  console.log(`[${c.id}] ${out.secs}s`, JSON.stringify(out.signals));
  return out;
}

const results = [];
let next = 0;
await Promise.all(Array.from({ length: conc }, async () => {
  while (next < cases.length) { const c = cases[next++]; results.push(await runCase(c)); }
}));
results.sort((a, b) => cases.findIndex((c) => c.id === a.id) - cases.findIndex((c) => c.id === b.id));

const runs = path.join(here, 'runs');
fs.mkdirSync(runs, { recursive: true });
fs.writeFileSync(path.join(runs, label + '.json'), JSON.stringify(results, null, 1));

const sum = (k) => results.reduce((n, r) => n + (r.signals?.[k] || 0), 0);
const md = [`# Feed eval: ${label}`, '',
  `${results.length} cases · failed slots ${sum('failedSlots')} · knowledge fallback ${sum('knowledgeFallback')} · listicle-looking ${sum('listicleLooking')} · duplicate domains ${sum('duplicateDomains')} · thin search ${sum('thinSearch')}`, ''];
for (const r of results) {
  md.push(`## ${r.id} (${r.kind})`, `> ${r.question}`, '');
  if (r.error) { md.push(`ERROR: ${r.error}`, ''); continue; }
  md.push(`Reading: domain "${r.reading.domain}" · mode ${r.reading.mode} · register ${r.reading.register} · type "${r.reading.questionType}"`, '');
  for (const it of r.items) {
    if (it.failed) { md.push(`- **${it.slot}**: FAILED — ${it.error}`); continue; }
    md.push(`- **${it.slot}** [${it.provenance}/${it.linkCheck}/${it.mediaType}] ${it.title} — ${it.source}`, `  - url: ${it.url}`, `  - query: ${it.query ?? '(knowledge tier)'}`, `  - why: ${it.why}`);
    if (it.candidates) md.push(`  - search returned ${it.candidates.length}: ${it.candidates.map((x) => domain(x.url)).join(', ')}`);
  }
  md.push('');
}
fs.writeFileSync(path.join(runs, label + '.md'), md.join('\n'));
console.log(`\nwrote scripts/feed-eval/runs/${label}.md`);
