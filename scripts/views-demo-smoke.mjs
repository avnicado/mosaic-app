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
  headline: 'Vaccines work; the fight is over rules.',
  settled: [{ text: 'Vaccines have saved over 150 million lives since 1974.', search: 'vaccines lives saved 50 years lancet' }],
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
  if (sys.startsWith('You map public')) return { status: 200, json: { choices: [{ message: { content: JSON.stringify(mapReply) } }] } };
  return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { group: 1, result: 1, outlet: 'AAP', quote: 'The text of article 11 which argues' },
    { group: 1, result: 2, outlet: 'NYT', quote: 'made up words' },
    { group: 2, result: 1, outlet: 'Outlet' },
    { group: 3, result: 9 },           // no such result → ignored
    { group: 4, result: 1 },           // fact
  ] }) } }] } };
};
let searches = 0;
const search = async (q) => { searches++; const base = { q1: 10, q2: 20, q3: 30 }[q] ?? 40; return [R(base + 1), R(base + 2), { title: 'x', url: 'https://pinterest.com/p', snippet: 'short' }]; };
const check = async (url) => !url.endsWith('/12'); // one picked page is dead

const out = await mapLive('How valuable are vaccines?', { ip: '1.2.3.4', llm, search, check });
assert.equal(out.status, 'mapped');
assert.equal(calls, 2, 'two model calls');
assert.equal(searches, 4, 'one search per view (dupe dropped) + one per fact');
assert.deepEqual(out.views.map((v) => v.id), ['require', 'encourage'], 'duplicate view dropped, unsourced view dropped');
assert.equal(out.views[0].sources.length, 1, 'dead link dropped');
assert.equal(out.views[0].sources[0].quote, 'The text of article 11 which argues', 'quote kept only when in the text');
assert.equal(out.views[1].sources[0].quote, '');
assert.equal(out.settled[0].sources.length, 1, 'fact sourced');
assert.equal(out.cruxes.length, 1, 'non-splitting crux dropped; crux left without a right side dropped');
assert.ok(!('search' in out.views[0]) && !('search' in out.settled[0]), 'search strings stripped');

// cached: no more calls
const again = await mapLive('how valuable are vaccines', { ip: '1.2.3.4', llm, search, check });
assert.equal(again.cached, true);
assert.equal(calls, 2);

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

// the shape: closest view
const m = normalizeMap(mapReply);
assert.equal(closestTo(m, 'encourage').id, 'parents');

console.log('views-demo smoke: ok');
