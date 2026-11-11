// Headless check of the quest guide against a running dev server:
//   node scripts/quest-smoke.mjs [http://localhost:5200]
// Use an isolated server (MOSAIC_DATA_DIR=…) — this calls the model and search, not the store.
import { setApiBase } from '../src/engine/llm.js';
import { guideTurn, findWorks } from '../src/engine/quest.js';

setApiBase(process.argv[2] || 'http://localhost:5200');
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

const ctx = { title: '', learner: {}, map: [], transcript: [], items: [] };
const first = 'Teach me about rationality';
const t1 = await guideTurn(ctx, first);
console.log(secs(), 'TURN 1', JSON.stringify(t1, null, 1));

const answer = "I've read Thinking Fast and Slow and some LessWrong posts. I'm mostly curious how to actually change my mind well, not the math.";
const ctx2 = {
  title: t1.title, learner: { level: t1.learner.level, known: t1.learner.known, interests: t1.learner.interests },
  map: t1.map.add.map((b) => ({ ...b, status: 'open' })),
  transcript: [{ role: 'you', text: first }, { role: 'guide', text: t1.reply }], items: [],
};
const t2 = await guideTurn(ctx2, answer);
console.log(secs(), 'TURN 2', JSON.stringify(t2, null, 1));

const need = t2.find || { what: 'a clear, gentle introduction to updating beliefs well', level: 'gentle', count: 2, region: '' };
const learner2 = { ...ctx2.learner, known: [...(ctx2.learner.known || []), ...t2.learner.known], interests: [...(ctx2.learner.interests || []), ...t2.learner.interests] };
const works = await findWorks({ ...ctx2, learner: learner2 }, need);
for (const w of works) console.log(secs(), 'WORK', w.level, w.mediaType, `${w.title} — ${w.source} <${w.url}> [${w.linkCheck}]`, '\n   why:', w.why);
if (!works.length) console.log(secs(), 'NO WORKS FOUND');
