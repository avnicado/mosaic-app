// Smoke test for the public views page's live path (server/viewsDemo.js) and
// its shared shape (src/engine/viewsDemo.js), with the model, search and link
// check stubbed. Run: node scripts/views-demo-smoke.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

process.env.MOSAIC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vd-smoke-'));
process.env.LLM_FALLBACK = 'off';
const { mapLive } = await import('../server/viewsDemo.js');
const { normalizeMap, closestTo } = await import('../src/engine/viewsDemo.js');

const mapReply = {
  status: 'mapped',
  headline: 'Three views, split on school rules.',
  views: [
    { id: 'require', name: 'Require them for school', short: 'Require', summary: 's1', who: 'AAP', changeMind: 'c1', search: 'q1' },
    { id: 'encourage', name: 'Encourage, don’t require', short: 'Encourage', summary: 's2', who: 'x', changeMind: 'c2', search: 'q2' },
    { id: 'parents', name: 'Parents decide', short: 'Parents', summary: 's3', who: 'y', changeMind: 'c3', search: 'q3' },
    { id: 'dupe', name: 'Same as parents', short: 'Dupe', summary: 's4', search: 'q4' },
  ],
  cruxes: [
    { question: 'Should schools require shots?', left: 'Yes', right: 'No', why: 'w', positions: { require: 'left', encourage: 'right', parents: 'right', dupe: 'right' } },
    { question: 'Do mandates raise uptake?', left: 'Yes', right: 'Not much', positions: { require: 'left', encourage: 'mid', parents: 'right', dupe: 'right' } },
    { question: 'A crux nobody splits on', left: 'A', right: 'B', positions: { require: 'left', encourage: 'left', parents: 'left', dupe: 'left' } },
  ],
  wording: { assumes: null, leansAwayFrom: [] },
};
const R = (n) => ({ title: `A real article number ${n}`, url: `https://news.example-site.org/a/${n}`, snippet: `The text of article ${n} which argues the case at some length, clearly.` });

let calls = 0;
const llm = async (body) => {
  calls++;
  const sys = body.messages[0].content;
  if (!sys.startsWith('You match')) return { status: 200, json: { choices: [{ message: { content: JSON.stringify(mapReply) } }] } };
  if (sys.startsWith('You match questions')) return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { group: 1, result: 1, side: 'A', outlet: 'Pediatrics', says: 'The article argues that school rules lift uptake.', quote: 'The text of article 41' },
    { group: 1, result: 2, side: 'B', outlet: 'Op-ed', says: 'Rules breed resentment.' },
    { group: 1, result: 1, side: 'B', says: 'same page twice' },   // same page → ignored
    { group: 2, result: 1, side: 'C', says: 'bad side' },          // no such side → ignored
    { group: 2, result: 2, side: 'A' },                            // no words → ignored
  ] }) } }] } };
  return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { group: 1, result: 1, outlet: 'AAP', reason: 'School rules keep rates high.', quote: 'The text of article 11 which argues' },
    { group: 1, result: 2, outlet: 'NYT', reason: 'r', quote: 'made up words' },
    { group: 2, result: 1, outlet: 'Outlet' },
    { group: 3, result: 9 },           // no such result → ignored
    { group: 4, result: 1 },           // no such group → ignored
  ] }) } }] } };
};
let searches = 0;
const search = async (q) => { searches++; const base = { q1: 10, q2: 20, q3: 30 }[q] ?? 40; return [R(base + 1), R(base + 2), { title: 'x', url: 'https://pinterest.com/p', snippet: 'short' }]; };
const check = async (url) => !url.endsWith('/12'); // one picked page is dead

const out = await mapLive('How valuable are vaccines?', { ip: '1.2.3.4', llm, search, check });
assert.equal(out.status, 'mapped');
assert.equal(calls, 3, 'three model calls: map, view picks, ring picks');
assert.equal(searches, 5, 'one search per view (dupe dropped) and per split question');
assert.equal(out.cruxes[0].reading.length, 2, 'ring articles kept, one per side');
assert.deepEqual(out.cruxes[0].reading.map((r) => r.side), ['left', 'right']);
assert.equal(out.cruxes[0].reading[0].says, 'School rules lift uptake.'.replace(/^S/, 'S'), 'says tidied');
assert.equal(out.cruxes[0].reading[0].quote, 'The text of article 41', 'ring quote kept when in the text');
// Sourcing does not decide which views survive: only the duplicate goes. An
// unsourced view stays (the UI drops its "held by" line instead), because the
// old sourced-only rule could delete a settled question's mainstream view.
assert.deepEqual(out.views.map((v) => v.id), ['require', 'encourage', 'parents'], 'duplicate view dropped, unsourced view kept');
assert.equal(out.views[0].reasons.length, 1, 'dead link dropped');
assert.equal(out.views[0].reasons[0].text, 'School rules keep rates high.');
assert.equal(out.views[0].reasons[0].sources[0].quote, 'The text of article 11 which argues', 'quote kept only when in the text');
assert.equal(out.views[1].reasons[0].sources[0].quote, '');
assert.ok(out.views[1].reasons[0].text, 'a reason always has words');
assert.ok(!('settled' in out), 'no verdict section');
assert.equal(out.cruxes.length, 2, 'the crux nobody splits on is dropped; the other two stay');
assert.ok(!('search' in out.views[0]), 'search strings stripped');

// cached: no more calls
const again = await mapLive('how valuable are vaccines', { ip: '1.2.3.4', llm, search, check });
assert.equal(again.cached, true);
assert.equal(calls, 3);

// A page that debunks a claim must not be cited as arguing it.
const { reportedNotArgued } = await import('../server/viewsDemo.js');
const debunker = { title: 'Was the Moon landing fake? Debunking the conspiracy theories', snippet: 'You can tell Apollo was faked because of the reflections, say doubters. There is no evidence for this.' };
const arguer = { title: 'Why Apollo was staged', snippet: 'The reflections in the photographs come from studio lights, and the shadows do not converge.' };
assert.equal(reportedNotArgued(debunker, 'Reflections in Apollo photos indicate studio lighting.'), true, 'a debunking page cannot argue the claim');
assert.equal(reportedNotArgued(debunker, 'Hoax believers say the reflections come from studio lights.'), true, 'the topic words do not count as a refutation');
assert.equal(reportedNotArgued(debunker, ''), true, 'a pick with no words of its own is not waved through');
assert.equal(reportedNotArgued(debunker, 'There is no evidence the landing was faked.'), false, 'a debunking page may argue the refutation');
assert.equal(reportedNotArgued(arguer, 'Reflections in Apollo photos indicate studio lighting.'), false, 'an ordinary page is untouched');
// The URL alone can mark a page as being about a claim rather than for it.
assert.equal(reportedNotArgued({ title: 'See Pictures From the Apollo Moon Landing', url: 'https://www.nationalgeographic.com/science/article/apollo-moon-landing-hoax-pictures', snippet: 'Reflections come from studio lights, say doubters, in these pictures from the mission.' },
  'The reflections come from studio lights, proving it was staged.'), true, 'the path is read too');

// A map with no source anywhere is thin, not a map worth showing.
const noPick = async (body) => (body.messages[0].content.startsWith('You match')
  ? { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [] }) } }] } }
  : { status: 200, json: { choices: [{ message: { content: JSON.stringify(mapReply) } }] } });
const bare = await mapLive('Does any of this have a source?', { ip: '4.4.4.4', llm: noPick, search, check });
assert.equal(bare.status, 'none', 'no source anywhere → not mapped');
assert.equal(bare.thin, true);

// On a settled question the guard refuses the mainstream view's sources more
// often than the others' (a debunking page cited for it reads as a refutation).
// Sourcing must therefore never decide which views survive, or the map could
// show the denial views alone.
const settledReply = {
  status: 'mapped', headline: 'Three main views.',
  views: [
    { id: 'no-link', name: 'No link', short: 'No link', summary: 's', who: 'WHO', search: 'consensus' },
    { id: 'link', name: 'Vaccines trigger autism', short: 'Link', summary: 's', who: 'groups', search: 'claim' },
    { id: 'unsure', name: 'Needs more research', short: 'Unsure', summary: 's', who: 'some', search: 'more' },
  ],
  cruxes: [
    { question: 'Do studies show a link?', left: 'No link', right: 'Link exists', positions: { 'no-link': 'left', link: 'right', unsure: 'mid' } },
    { question: 'Is more research needed?', left: 'No, enough data', right: 'Yes, more needed', positions: { 'no-link': 'left', link: 'left', unsure: 'right' } },
  ],
  wording: { assumes: null, leansAwayFrom: [] },
};
const SET = {
  consensus: { title: 'Debunking the vaccine-autism myth', url: 'https://health.example.org/debunking-the-myth', snippet: 'Large studies looked at millions of children and found the schedule is safe for them.' },
  claim: { title: 'Why I believe vaccines harmed my child', url: 'https://parents.example.org/our-story', snippet: 'Our son regressed within weeks of the shot, and many families report the very same pattern.' },
  more: { title: 'The case for further study', url: 'https://journal.example.org/further-study', snippet: 'Existing trials are underpowered to rule out rare effects, so more longitudinal work is needed.' },
};
const settledLLM = async (body) => {
  const sys = body.messages[0].content;
  if (!sys.startsWith('You match')) return { status: 200, json: { choices: [{ message: { content: JSON.stringify(settledReply) } }] } };
  if (sys.startsWith('You match questions')) return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [] }) } }] } };
  return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { group: 1, result: 1, outlet: 'Health', reason: 'Large studies found the schedule is safe for children.' },
    { group: 2, result: 1, outlet: 'Parents', reason: 'Children regress within weeks of the shot.' },
    { group: 3, result: 1, outlet: 'Journal', reason: 'Existing trials are underpowered to rule out rare effects.' },
  ] }) } }] } };
};
const settled = await mapLive('Do vaccines cause autism?', { ip: '6.6.6.6', llm: settledLLM, search: async (q) => [SET[q] || SET.more], check: async () => true });
assert.ok(settled.views.some((v) => v.id === 'no-link'), 'the mainstream view survives losing its source to the guard');
assert.equal(settled.views.find((v) => v.id === 'no-link').reasons.length, 0, 'and the refused source is not kept');

// a personal question → none, with nearby questions, no dead end
const noneLLM = async () => ({ status: 200, json: { choices: [{ message: { content: JSON.stringify({ status: 'none', headline: 'Nothing to argue about.', nearby: ['Should cities ban gas stoves?'] }) } }] } });
const none = await mapLive('What should I cook tonight?', { ip: '1.2.3.4', llm: noneLLM, search, check });
assert.equal(none.status, 'none');
assert.equal(none.nearby.length, 1);

// live off → a clear 503, not a crash
await assert.rejects(() => mapLive('Should cities ban cars downtown?', { ip: '5.5.5.5', search: null }), (e) => e.status === 503);

// per-address cap
const many = async () => { for (let i = 0; i < 12; i++) await mapLive(`Question number ${i} about policy?`, { ip: '9.9.9.9', llm, search, check }); };
await assert.rejects(many, (e) => e.status === 429);

// the shape: closest view; a model that still says "settled" gets views or nothing, never a verdict
const m = normalizeMap(mapReply);
assert.equal(closestTo(m, 'encourage').id, 'parents');
assert.equal(normalizeMap({ ...mapReply, status: 'settled' }).status, 'mapped');
assert.equal(normalizeMap({ status: 'settled', headline: 'Yes.' }).status, 'none');

// the ready examples: views only, every view with reasons and sources
for (const f of ['vaccines', 'social', 'nuclear']) {
  const raw = JSON.parse(fs.readFileSync(new URL(`../src/viewsdemo/examples/${f}.json`, import.meta.url), 'utf8'));
  const ex = normalizeMap({ status: 'mapped', ...raw });
  assert.equal(ex.status, 'mapped', f);
  assert.ok(!('settled' in raw) && !('settled' in ex), `${f}: no verdict section`);
  assert.equal(ex.views.length, raw.views.length, `${f}: every view kept`);
  assert.equal(ex.cruxes.length, raw.cruxes.length, `${f}: every split kept`);
  for (const v of ex.views) assert.ok(v.reasons.length >= 2 && v.reasons.every((r) => r.sources.length), `${f}/${v.id} has sourced reasons`);
}

console.log('views-demo smoke: ok');
