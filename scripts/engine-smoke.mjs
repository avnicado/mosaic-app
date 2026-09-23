// Headless engine check against a running dev server (npm run dev):
//   node scripts/engine-smoke.mjs [http://localhost:5200]
import { setApiBase } from '../src/engine/llm.js';
import { readThread, judgeMovement, effectHistory, applyCorrections } from '../src/engine/thread.js';
import { runFeed } from '../src/engine/feed.js';

setApiBase(process.argv[2] || 'http://localhost:5200');
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';

const question = 'Why do some hobbies stick for a lifetime while others fade after a month?';
const reading = await readThread({ question });
console.log(secs(), 'READING', JSON.stringify(reading, null, 1));

const rejected = reading.presuppositions[0];
const corrections = { rejected: [rejected], added: [{ field: 'absent', text: 'the role of other people in keeping a hobby alive' }] };
const reread = await readThread({ question, reading, corrections });
console.log(secs(), 'RE-READ keeps correction:', !reread.presuppositions.includes(rejected), reread.absent.includes('the role of other people in keeping a hobby alive'));

const items = await runFeed({ question, reading: reread, corrections }, {
  onItem: (it) => console.log(secs(), 'SLOT', it.slot, it.failed ? 'FAILED ' + it.error : `${it.provenance}/${it.linkCheck} ${it.title} <${it.url}>`),
});

const byId = {};
items.forEach((it, i) => { it.id = 'i' + i; it.signal = i === 0 ? 'moved' : i === 3 ? 'closed' : null; byId[it.id] = it; });
const diff = await judgeMovement({
  before: question,
  after: 'Which hobbies get woven into a social life or identity early enough that quitting would cost something?',
  moved: [items[0]], closed: [items[3]], note: 'The first piece made it about belonging, not willpower.',
});
console.log(secs(), 'DIFF', JSON.stringify(diff, null, 1));
const hist = effectHistory([{ closedAt: 1, articulationAtOpen: question, articulationAtClose: 'x', itemIds: Object.keys(byId), diff }], byId);
console.log(secs(), 'HISTORY\n' + hist);
const ok = items.filter((i) => !i.failed && /^https?:/.test(i.url)).length;
console.log(ok === 4 && diff.moves.length ? 'ENGINE OK' : 'ENGINE PROBLEM', `(${ok}/4 slots)`);
