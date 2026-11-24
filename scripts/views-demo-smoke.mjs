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

// ---- what cannot be anyone's argument, and what standing a page has --------
const { notAnArgument, standingOf } = await import('../src/engine/viewsDemo.js');
for (const u of [
  'https://en.wikipedia.org/wiki/Passive_nuclear_safety',   // an encyclopaedia entry
  'https://stackoverflow.com/questions/2976630/how',        // a question-and-answer thread
  'https://brainly.com/question/52757778',                  // a homework answer
  'https://www.studocu.com/en-us/document/x/persuasive-speech-outline/1', // a student's upload
  'https://medium.com/@someone/ban-cars-in-manhattan-401',  // a personal-platform post
  'https://go.dev',                                         // a site's front page
  'https://go.dev/',
  'https://www.crisisgroup.org/',
  // A ring piece is a page with a line quoted from it. A video is not one, and
  // a YouTube video was cited as an argument that the moon landings were real.
  'https://www.youtube.com/watch?v=abc123',
  'https://youtu.be/abc123',
  'https://aws.plainenglish.io/rust-vs-go-backend-1234',
]) assert.equal(notAnArgument(u), true, `not an argument: ${u}`);
for (const u of [
  'https://www.thelancet.com/journals/lanpub/article/PIIS2468-2667(23)00120-2/fulltext',
  'https://world-nuclear.org/information-library/nuclear-waste',
  'https://lieber.westpoint.edu/idf-hamas-duty-to-warn',
  'https://zenodo.org/records/17451259',
]) assert.equal(notAnArgument(u), false, `a real argument: ${u}`);

// The model writes the outlet, so it can dress a page up ("Australian
// Government (APH)" for a document one senator tabled). The standing is read
// off the URL instead.
assert.equal(standingOf('https://www.aph.gov.au/-/media/Estimates/ca/add2526/Health/03_TabledDoc_SenatorRobertsAluminumAdjuvants.pdf'), 'Submitted to a hearing');
assert.equal(standingOf('https://www.authorea.com/doi/full/10.22541/au.173714739/v7'), 'Preprint, not peer reviewed');
// One witness's testimony filed with a committee is that witness's case, not
// the legislature's. Without this the Kentucky filing came out labelled
// "Government or official body".
assert.equal(standingOf('https://apps.legislature.ky.gov/CommitteeDocuments/362/22848/03%2014%202023%20Testimony%20of%20Matt.pdf'), 'Submitted to a hearing');
// A transcript is what someone said on a day, not the body's position, and it
// may be decades old: a 1997 NATO transcript was cited on a ring about 2022.
assert.equal(standingOf('https://www.nato.int/en/news-and-events/events/transcripts/1997/04/28/political-implications'), 'Transcript of remarks');
assert.equal(standingOf('https://researchbriefings.files.parliament.uk/documents/CBP-10226/CBP-10226.pdf'), 'Government or official body');
assert.equal(standingOf('https://zenodo.org/records/17451259'), 'Posted to an open archive');
assert.equal(standingOf('https://pubmed.ncbi.nlm.nih.gov/24814559'), 'Peer reviewed');
assert.equal(standingOf('https://www.nrc.gov/docs/ML2519/ML25197A463.pdf'), 'Government or official body');
assert.equal(standingOf('https://lieber.westpoint.edu/idf-hamas-duty-to-warn'), 'University');
assert.equal(standingOf('https://world-nuclear.org/information-library/nuclear-waste'), '', 'a trade body carries no label');

// ---- when a page is from ---------------------------------------------------
// Tavily is asked for published_date now, but it is an estimate and often null,
// so a date in the URL is the fallback. A bare year in a TITLE is never read:
// titles name years they only discuss.
const { dateOf } = await import('../src/engine/viewsDemo.js');
assert.equal(dateOf({ published: '2026-02-14T00:00:00Z', url: 'https://x.org/a' }), '2026-02');
assert.equal(dateOf({ published: 'Thu, 13 Feb 2025 13:52:00 GMT', url: 'https://x.org/a' }), '2025-02');
assert.equal(dateOf({ published: '2099-01-01', url: 'https://x.org/a' }), '', 'a date in the future is an estimate gone wrong');
assert.equal(dateOf({ url: 'https://twisted.news/2026-01-26-gaza-reports.html' }), '2026-01');
assert.equal(dateOf({ url: 'https://www.nato.int/en/events/transcripts/1997/04/28/political' }), '1997-04');
assert.equal(dateOf({ url: 'https://maxmautner.com/2026/02/22/pedestrianization.html' }), '2026-02');
assert.equal(dateOf({ url: 'https://cepr.net/documents/min-wage-2013-02.pdf' }), '2013');
assert.equal(dateOf({ url: 'https://x.org/a', snippet: '14 Feb 2026 — the piece begins here' }), '2026');
assert.equal(dateOf({ url: 'https://escholarship.org/content/qt52j400b1.pdf', title: 'Internal Combustion Engine Bans and Global Oil Use after 2035' }), '', 'a year a title merely mentions is not a date');
assert.equal(dateOf({ url: 'https://x.org/no-date-here' }), '');
// The date reaches the model: every line of a pick prompt carries it.
const { ringPickPrompt } = await import('../src/engine/viewsDemo.js');
const datedPrompt = ringPickPrompt([{ crux: { question: 'q?', left: 'A', right: 'B' }, about: 'the map question',
  results: [{ title: 'T', url: 'https://x.org/2019/05/p', snippet: 'a snippet' }, { title: 'U', url: 'https://x.org/p', snippet: 'another' }] }]);
assert.match(datedPrompt, /\(x\.org, 2019-05\)/, 'a known date is shown');
assert.match(datedPrompt, /\(x\.org, date unknown\)/, 'an unknown one is said to be unknown');
assert.match(datedPrompt, /About: the map question/);

// ---- the pieces on one ring's question (ringSides) -------------------------
const { ringSides, RING_PER_HOUR_PER_IP } = await import('../server/viewsDemo.js');
const RS = (url, title, snippet) => ({ url, title, snippet: snippet || 'A page that makes its case at some length, with enough words in it to be usable.' });
const RING_IN = {
  question: 'Should cities ban cars downtown?',
  crux: { question: 'Will bans hurt downtown shops?', left: 'Yes, sales drop', right: 'No, foot traffic rises' },
  holders: { left: ['Keep cars: shops need drivers'], right: ['Full ban: streets for people'] },
  have: [],
};
// Side A gets two pages that cannot be arguments and one that can; side B gets
// a preprint and a page whose title argues the other answer.
const RING_RESULTS = {
  A: [RS('https://en.wikipedia.org/wiki/Pedestrian_zone', 'Pedestrian zone - Wikipedia'),
      RS('https://brainly.com/question/1', 'Why do car bans hurt shops? - Brainly'),
      RS('https://retailers.example.org/parking-and-sales', 'Parking fees cut customer visits and sales')],
  B: [RS('https://www.authorea.com/doi/full/10.1/v1', 'Car-free streets raise retail takings'),
      RS('https://trade.example.org/no-harm', 'Car-free streets are not a threat to shops')],
};
let ringLLM = 0, ringSearches = [];
const ringCalls = async (body) => {
  ringLLM++;
  const sys = body.messages[0].content;
  if (sys.startsWith('You write web searches')) {
    assert.match(body.messages[1].content, /About: Should cities ban cars downtown\?/, 'the map question goes into the query call');
    return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ A: 'parking fees cut shop sales', B: 'car free streets retail takings rise' }) } }] } };
  }
  // The pick call sees only the pages that could be an argument, in one list.
  const prompt = body.messages[1].content;
  assert.match(prompt, /About: Should cities ban cars downtown\?/, 'the map question goes into the pick call');
  assert.ok(!/wikipedia|Brainly/i.test(prompt), 'an encyclopaedia entry and a homework answer never reach the model');
  const urls = [...prompt.matchAll(/^  (\d+)\. (.+?) \(/gm)].map((m) => m[2]);
  assert.deepEqual(urls, ['Parking fees cut customer visits and sales', 'Car-free streets raise retail takings', 'Car-free streets are not a threat to shops']);
  return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { result: 1, side: 'A', outlet: 'Retailers', says: 'Parking fees cut customer visits and lower sales for shops.', title_side: 'A' },
    { result: 2, side: 'B', outlet: 'Authorea', says: 'Car-free streets raise retail takings across the district.', title_side: 'B' },
    { result: 3, side: 'B', outlet: 'Trade body', says: 'Shops do just as well.', title_side: 'A' },  // its title argues A → dropped
    { result: 1, side: 'B', says: 'the same page on the other side' },                                 // same page → dropped
  ] }) } }] } };
};
const ringSearch = async (q, opts) => {
  ringSearches.push({ q, excluded: (opts?.excludeDomains || []).length });
  return /parking/.test(q) ? RING_RESULTS.A : RING_RESULTS.B;
};
const r1 = await ringSides(RING_IN, { ip: 'r', unlimited: true, llm: ringCalls, search: ringSearch, check: async () => true });
assert.equal(ringLLM, 2, 'one call writes the searches, one picks the pages');
assert.equal(ringSearches.length, 2, 'one search per answer');
assert.ok(ringSearches.every((x) => x.excluded > 0), 'fact-check sites are excluded at the search');
assert.deepEqual(r1.reading.map((x) => x.side), ['left', 'right'], 'one piece per side; the wrong-side page is dropped');
assert.equal(r1.reading[0].url, 'https://retailers.example.org/parking-and-sales');
assert.equal(r1.reading[1].url, 'https://www.authorea.com/doi/full/10.1/v1');

// Asked again, nothing is paid for twice.
const r2 = await ringSides(RING_IN, { ip: 'r', unlimited: true, llm: async () => assert.fail('cached'), search: async () => assert.fail('cached'), check: async () => true });
assert.equal(r2.cached, true);
assert.equal(r2.reading.length, 2);
// A page already on the ring is not offered again.
const r3 = await ringSides({ ...RING_IN, have: ['https://retailers.example.org/parking-and-sales'] }, { ip: 'r', unlimited: true, llm: async () => assert.fail('cached'), search: async () => assert.fail('cached') });
assert.equal(r3.reading.length, 1, 'a page the ring already shows is left out');

// A ring that found nothing is cached too, so the "Try again" in the pop-up is
// free for a while. One in five rings comes back empty after a full price of
// searches and model calls.
const EMPTY_IN = { ...RING_IN, crux: { ...RING_IN.crux, question: 'Does anything argue this at all?' } };
let emptyCalls = 0;
const emptyLLM = async (body) => {
  emptyCalls++;
  return body.messages[0].content.startsWith('You write web searches')
    ? { status: 200, json: { choices: [{ message: { content: JSON.stringify({ A: 'a', B: 'b' }) } }] } }
    : { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [] }) } }] } };
};
const e1 = await ringSides(EMPTY_IN, { ip: 'r', unlimited: true, llm: emptyLLM, search: ringSearch, check: async () => true });
assert.equal(e1.reading.length, 0);
const e2 = await ringSides(EMPTY_IN, { ip: 'r', unlimited: true, llm: emptyLLM, search: ringSearch, check: async () => true });
assert.equal(e2.cached, true, 'an empty ring is held briefly, so a retry is free');
assert.equal(emptyCalls, 2, 'and costs no further model calls');

// An answer left empty gets a second search, in the other wording the query
// call wrote, and one more picking call. Half the rings in the live run showed
// one answer with articles and the other with none.
const SECOND_IN = { ...RING_IN, crux: { ...RING_IN.crux, question: 'Does the second pass find the other side?' } };
let qCalls = 0, pickCalls = 0, searched = [], secondSys = '', secondPrompt = '';
const secondLLM = async (body) => {
  const sys = body.messages[0].content;
  if (sys.startsWith('You write web searches')) {
    qCalls++;
    return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ A: 'first A words', A2: 'other A words', B: 'first B words', B2: 'other B words' }) } }] } };
  }
  pickCalls++;
  if (pickCalls === 1) {
    return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
      { result: 1, side: 'A', outlet: 'One', says: 'Only side A turns up on the first wording.', title_side: 'A' },
    ] }) } }] } };
  }
  // Recorded, not asserted here: the second pass is wrapped in a try/catch so a
  // failure can never cost what the first round found, and an assertion thrown
  // in here would be swallowed by it.
  secondSys = sys;
  secondPrompt = body.messages[1].content;
  return { status: 200, json: { choices: [{ message: { content: JSON.stringify({ picks: [
    { result: 1, side: 'A', outlet: 'Ignored', says: 'A page for the side that is already full.', title_side: 'A' },
    { result: 1, side: 'B', outlet: 'Two', says: 'The other side, found only by the second wording.', title_side: 'B' },
  ] }) } }] } };
};
const secondSearch = async (q) => {
  searched.push(q);
  if (/other [AB] words/.test(q)) return [RS('https://b-side.example.org/only-on-the-second-wording', 'Car-free streets lift takings, the second case')];
  return [RS('https://a-side.example.org/first', 'Parking fees cut shop sales')];
};
const sec = await ringSides(SECOND_IN, { ip: 'r', unlimited: true, llm: secondLLM, search: secondSearch, check: async () => true });
assert.equal(qCalls, 1, 'the fallback wording comes from the one query call, not a second one');
assert.equal(pickCalls, 2, 'one picking call per round');
assert.deepEqual(searched, ['first A words', 'first B words', 'other B words'], 'only the empty answer is searched again');
assert.deepEqual(sec.reading.map((x) => x.side), ['left', 'right'], 'both answers now have a piece');
assert.equal(sec.reading[1].url, 'https://b-side.example.org/only-on-the-second-wording');
assert.equal(sec.reading.filter((x) => x.side === 'left').length, 1, 'the full side gains nothing from the second round');
assert.match(secondSys, /Only these answers are still open: B\b/, 'the second call is told only B is open');
assert.match(secondPrompt, /Car-free streets lift takings, the second case \(b-side\.example\.org/, 'it sees the page the fallback wording found');

// A dead link never reaches the reader.
const DEAD_IN = { ...RING_IN, crux: { ...RING_IN.crux, question: 'Is the link alive?' } };
const dead = await ringSides(DEAD_IN, { ip: 'r', unlimited: true, llm: ringCalls, search: ringSearch, check: async (u) => !u.includes('authorea') });
assert.deepEqual(dead.reading.map((x) => x.side), ['left'], 'the page that would not open is gone');

// a missing answer → a clear 400, not a crash
await assert.rejects(() => ringSides({ question: 'x?', crux: { question: 'y?', left: 'a' } }, { ip: 'r', unlimited: true }), (e) => e.status === 400);
// per-address cap on rings
await assert.rejects(async () => {
  for (let i = 0; i < RING_PER_HOUR_PER_IP + 2; i++) {
    await ringSides({ ...RING_IN, crux: { ...RING_IN.crux, question: `Capped question number ${i}?` } }, { ip: 'capped', llm: emptyLLM, search: ringSearch, check: async () => true });
  }
}, (e) => e.status === 429);


console.log('views-demo smoke: ok');
