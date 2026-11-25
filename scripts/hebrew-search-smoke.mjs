// Headless check of searching in Hebrew (src/engine/lang.js, feed.js, quest.js).
// The model and the search are stubbed, so nothing leaves the machine.
//   node scripts/hebrew-search-smoke.mjs
// In Hebrew: a slot searches in Hebrew first and keeps a Hebrew pick; when
// Hebrew finds too few it falls back to the English search; prose is asked
// for in Hebrew. In English: the prompts are exactly as before.
import { setApiBase } from '../src/engine/llm.js';
import { setContentLang } from '../src/engine/lang.js';
import { fillSlot } from '../src/engine/feed.js';
import { findWorks } from '../src/engine/quest.js';
import { searchQueryPrompt, selectFromResultsPrompt, knowledgePrompt, characterizePrompt, diffPrompt } from '../src/engine/prompts.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };
const HE = /[א-ת]/;

let heResults = 3; // Hebrew results a Hebrew query gets
const log = { prompts: [], queries: [] };
setApiBase('http://stub');
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
  if (u.endsWith('/api/llm')) {
    const prompt = body.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    log.prompts.push(prompt);
    let out;
    if (/web-search query/.test(prompt)) out = { query: /IN HEBREW/.test(prompt) ? 'מסה על זיכרון ושכחה' : 'essay on memory and forgetting' };
    else if (/REAL web search results/.test(prompt)) {
      const urls = [...prompt.matchAll(/url: (\S+)/g)].map((m) => m[1]);
      const many = /up to \d+ that best fit/.test(prompt);
      const pick = { title: 'picked', source: 'someone', url: urls[0], mediaType: 'article', preview: 'p', why: 'w', field: 'philosophy & ideas', topics: ['memory'], level: 'gentle' };
      out = many ? { picks: urls.slice(0, 2).map((url) => ({ ...pick, url })) } : pick;
    } else out = {};
    return json({ choices: [{ message: { content: JSON.stringify(out) } }] });
  }
  if (u.endsWith('/api/search')) {
    log.queries.push(body.query);
    const he = HE.test(body.query);
    const results = he
      ? [
        ...Array.from({ length: heResults }, (_, i) => ({ title: `על הזיכרון והשכחה, פרק ${i + 1}`, url: `https://he-mag.example.co.il/a${i}`, snippet: 'מסה ארוכה על זיכרון.' })),
        { title: 'An English page that a Hebrew search returned', url: 'https://en-mag.example.org/x', snippet: 'English text.' },
      ]
      : [
        { title: 'On memory and forgetting', url: 'https://en-mag.example.org/memory', snippet: 'A long essay.' },
        { title: 'The art of forgetting, a talk', url: 'https://en-talks.example.org/forget', snippet: 'A talk.' },
      ];
    return json({ results });
  }
  if (u.endsWith('/api/checkurl')) return json({ ok: true, reason: 'ok' });
  throw new Error('unexpected fetch ' + u);
};

const ctx = { question: 'למה אנחנו שוכחים?', reading: { register: 'curious', mode: 'question', presuppositions: [] } };

// ---- English: prompts unchanged -------------------------------------------------------
setContentLang('en');
const enPrompts = [
  searchQueryPrompt('sharpen', ctx), searchQueryPrompt('sharpen', ctx, [], { lang: 'en' }),
  selectFromResultsPrompt('sharpen', ctx, [{ title: 't', url: 'https://x.org', snippet: 's' }]),
  knowledgePrompt('sharpen', ctx), characterizePrompt(ctx), diffPrompt({ before: 'a', after: 'b' }),
];
check('English prompts carry no language lines', enPrompts.every((p) => !/IN HEBREW|in Hebrew|in English, even|he\.wikipedia/.test(p)));
check('English: the query prompt is the same with or without a language', enPrompts[0] === enPrompts[1]);
const en = await fillSlot('sharpen', ctx);
check('English: one English search, an English pick', log.queries.length === 1 && !HE.test(log.queries[0]) && en.url === 'https://en-mag.example.org/memory', JSON.stringify([log.queries, en.url]));

// ---- Hebrew, enough Hebrew results --------------------------------------------------
setContentLang('he');
log.prompts = []; log.queries = [];
heResults = 3;
const he = await fillSlot('sharpen', ctx);
check('Hebrew: the first query is asked for in Hebrew', /IN HEBREW/.test(log.prompts[0]) && HE.test(log.queries[0]));
check('Hebrew: a Hebrew pick, from the Hebrew results only', he.url === 'https://he-mag.example.co.il/a0' && log.queries.length === 1, JSON.stringify([log.queries, he.url]));
const sel = log.prompts.find((p) => /REAL web search results/.test(p)) || '';
check('Hebrew: the selector sees only Hebrew results', sel.includes('he-mag.example.co.il') && !sel.includes('en-mag.example.org'));
check('Hebrew: preview and why are asked for in Hebrew', /write "preview" and "why" in Hebrew/.test(sel));

// ---- Hebrew, too few Hebrew results: English fallback ---------------------------------
log.prompts = []; log.queries = [];
heResults = 1;
const fb = await fillSlot('sharpen', ctx);
check('Hebrew, too few: falls back to an English search', log.queries.length === 2 && HE.test(log.queries[0]) && !HE.test(log.queries[1]), JSON.stringify(log.queries));
// (the Hebrew query prompt is answered from the 5-minute cache this time, so only the English one is sent)
check('Hebrew, too few: the fallback query is asked for in English', log.prompts.some((p) => /web-search query/.test(p) && /Write the query in English, even if the question is in Hebrew/.test(p)));
check('Hebrew, too few: an English pick, still described in Hebrew', fb.url === 'https://en-mag.example.org/memory' && /in Hebrew/.test(log.prompts.filter((p) => /REAL web search results/.test(p)).pop() || ''), fb.url);

// ---- Hebrew: the knowledge tier may use Hebrew Wikipedia --------------------------------
check('Hebrew: the knowledge tier may give a Hebrew Wikipedia article', /he\.wikipedia\.org/.test(knowledgePrompt('sharpen', ctx)));
check('Hebrew: the reading is asked for in Hebrew', /in Hebrew/.test(characterizePrompt(ctx)));

// ---- quests ---------------------------------------------------------------------------
const qctx = { title: 'זיכרון', learner: {}, map: [], items: [] };
log.queries = [];
heResults = 3;
const works = await findWorks(qctx, { what: 'an introduction to memory', level: 'gentle', count: 2, region: '' });
check('quest, Hebrew: Hebrew works first, from a Hebrew search', works.length === 2 && works.every((w) => w.url.includes('he-mag')) && log.queries.length === 1 && HE.test(log.queries[0]), JSON.stringify([log.queries, works.map((w) => w.url)]));
log.queries = [];
heResults = 0;
const works2 = await findWorks(qctx, { what: 'an introduction to memory', level: 'gentle', count: 2, region: '' });
check('quest, Hebrew: no Hebrew works, so English fills in', works2.length === 2 && log.queries.length === 2 && !HE.test(log.queries[1]), JSON.stringify([log.queries, works2.map((w) => w.url)]));
setContentLang('en');
log.queries = [];
await findWorks(qctx, { what: 'an introduction to memory', level: 'gentle', count: 2, region: '' });
check('quest, English: no Hebrew search', log.queries.every((q) => !HE.test(q)), JSON.stringify(log.queries));

console.log(failed ? `\n${failed} FAILED` : '\nall Hebrew search checks passed');
process.exit(failed ? 1 : 0);
