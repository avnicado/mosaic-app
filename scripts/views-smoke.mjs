// Headless check of the views mandala: map validation, the arithmetic on a
// map, the server flow with a stubbed model and search, and the admin gate.
//   node scripts/views-smoke.mjs
// No network: the model and the search are stubs. Uses the local file store.
import { normalizeViews, closestOf, leanAgainst, agreement, pickPrompt } from '../src/engine/views.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

const RAW = {
  status: 'divisive', why: 'Governments are acting and researchers disagree on the evidence.', topic: 'teens and social media',
  settled: ['Most teens use social media daily'],
  cruxes: [
    { kind: 'evidence', label: 'Harm', question: 'Does social media cause the rise in teen anxiety?', a: 'Yes, it causes it', b: 'Correlation only' },
    { kind: 'effect', label: 'Enforcement', question: 'Can an age ban be enforced?', a: 'Yes, with age checks', b: 'Kids will get around it' },
    { kind: 'trade-off', label: 'Privacy', question: 'Is age verification worth the privacy cost?', a: 'Worth it', b: 'Too costly' },
    { kind: 'fact', label: 'Values', question: 'Do we care about kids?', a: 'Yes', b: 'No' }, // no split: dropped
  ],
  views: [
    { name: 'Ban under 16', summary: 's1', answers: ['a', 'a', 'a', 'a'], changeMind: 'c1', search: 'q1' },
    { name: 'Make platforms safer', summary: 's2', answers: ['a', 'b', 'mid', 'a'], changeMind: 'c2', search: 'q2' },
    { name: 'Teach, don\'t ban', summary: 's3', answers: ['b', 'b', 'b', 'a'], changeMind: 'c3', search: 'q3' },
    { name: 'Parents decide', summary: 's4', answers: ['mid', 'b', 'b', 'a'], changeMind: 'c4', search: 'q4' },
    { name: 'Copy of ban', summary: 's5', answers: ['a', 'a', 'a', 'a'], changeMind: 'c5', search: 'q5' }, // duplicate: dropped
  ],
  lean: ['a', null, null, 'a'],
  leanWhy: 'The wording takes the harm as given.',
};

// ---- validation ----
const map = normalizeViews(RAW);
check('divisive kept', map.status === 'divisive');
check('a crux that does not split the views is dropped', map.cruxes.length === 3 && !map.cruxes.some((c) => c.label === 'Values'));
check('answers follow the dropped crux', map.views.every((v) => v.answers.length === 3));
check('lean follows the dropped crux', map.lean.length === 3 && map.lean[0] === 'a');
check('a view identical to another is dropped', map.views.length === 4 && !map.views.some((v) => v.name === 'Copy of ban'));
check('bad answers become in-between', normalizeViews({ ...RAW, views: RAW.views.map((v, i) => (i === 1 ? { ...v, answers: ['x', 'b', 'b', 'a'] } : v)) }).views[1].answers[0] === 'mid');
check('settled questions carry no map', (() => { const m = normalizeViews({ status: 'settled', why: 'w', cruxes: RAW.cruxes, views: RAW.views }); return m.status === 'settled' && !m.views; })());
check('nonsense status is "not"', normalizeViews({ status: 'maybe' }).status === 'not');
check('too few views is "not"', normalizeViews({ ...RAW, views: RAW.views.slice(0, 2) }).status === 'not');

// ---- arithmetic ----
check('agreement counts matches', agreement(['a', 'b'], ['a', 'b']) === 2 && agreement(['a', 'b'], ['b', 'a']) === 0);
const c3 = closestOf(map, 2); // Teach, don't ban
check('closest to the most alike view', map.views[c3.index].name === 'Parents decide' && c3.same === 2, JSON.stringify(c3));
check('the wording leans away from the view that rejects its assumption', leanAgainst(map, 2).away === true);
check('…and not from the view that shares it', leanAgainst(map, 0).away === false && leanAgainst(map, 0).assumed === 1);
check('in between is not against', leanAgainst(map, 3).away === false);
check('no lean, nothing leans away', map.views.every((_, i) => !leanAgainst({ ...map, lean: [null, null, null] }, i).away));
check('pick prompt numbers results per view', /View 2: "Make platforms safer"/.test(pickPrompt(map.views, [[{ title: 'T', url: 'https://a.org/x', snippet: 's' }]])) && /1\. T \(a\.org\)/.test(pickPrompt(map.views, [[{ title: 'T', url: 'https://a.org/x', snippet: 's' }]])));

// ---- server flow, stubbed ----
const { mapViews } = await import('../server/views.js');
let calls = 0;
const reply = (obj) => ({ status: 200, json: { choices: [{ message: { content: JSON.stringify(obj) } }] } });
const llm = async (body) => {
  calls++;
  if (body.messages[0].content.startsWith('You are matching')) {
    return reply({ picks: [{ view: 1, result: 1, by: 'A Writer' }, { view: 2, result: 2 }, { view: 3, result: null }] });
  }
  return reply(RAW);
};
const search = async (q) => [
  { title: 'Top 10 reasons to ban phones', url: 'https://junk.example.org/a', snippet: 'x'.repeat(80) }, // listicle: filtered
  { title: `An essay making the case: ${q}`, url: `https://essays.org/${encodeURIComponent(q)}`, snippet: 'y'.repeat(100) },
  { title: `A report arguing for ${q}`, url: `https://reports.org/${encodeURIComponent(q)}`, snippet: 'z'.repeat(100) },
];
const question = `Should under-16s be banned from social media? (smoke ${Date.now()})`;
const out = await mapViews({ question }, { llm, search });
check('two model calls for a divisive question', calls === 2, `calls=${calls}`);
check('a piece is a real search result', out.views[0].piece?.url === 'https://essays.org/q1' && out.views[0].piece.by === 'A Writer', JSON.stringify(out.views[0].piece));
check('the junk result is never picked', out.views.every((v) => !v.piece || !v.piece.url.includes('junk')));
check('a view with no pick gets none', out.views[2].piece === null);
check('search strings are not sent to the page', out.views.every((v) => !('search' in v)));
const again = await mapViews({ question }, { llm, search });
check('a mapped question is served from the store', calls === 2 && again.cached === true);
let notCalls = 0;
const notOut = await mapViews({ question: `What should I cook tonight? (smoke ${Date.now()})` }, { llm: async () => { notCalls++; return reply({ status: 'not', why: 'personal' }); }, search });
check('one model call for a question that is not contested', notOut.status === 'not' && notCalls === 1);

// ---- the admin gate ----
process.env.APP_PASSWORD = 'smoke-pass';
const { default: route } = await import('../server/routes/views.js');
const { sessionCookie } = await import('../server/auth.js');
const run = async (cookie, body = { question: 'x' }) => {
  let code = 0, json = null;
  const res = { status(c) { code = c; return res; }, json(j) { json = j; return res; }, setHeader() {} };
  await route({ method: 'POST', headers: cookie ? { cookie } : {}, body }, res);
  return { code, json };
};
check('signed out gets 401', (await run(null)).code === 401);
const { signUp, removeUser } = await import('../server/users.js');
let member = null;
try { member = await signUp(`smoke${Date.now()}`, 'pw-smoke-12345'); } catch (e) { console.log('     (no member made:', e.message, ')'); }
member = member?.user || member;
if (member?.id) {
  const c = sessionCookie(member.id).split(';')[0];
  check('a member who is not the admin gets 403', (await run(c)).code === 403);
  await removeUser(member.id).catch(() => {});
} else { check('made a member to test the gate', false); }
const owner = sessionCookie('owner').split(';')[0];
const ownerRes = await run(owner, {});
check('the admin gets through the gate (400 for an empty question)', ownerRes.code === 400, JSON.stringify(ownerRes));

console.log(failed ? `\n${failed} FAILED` : '\nall views checks passed');
process.exit(failed ? 1 : 0);
