// Headless check of the learned reading pace and block judgement:
//   node scripts/pace-smoke.mjs
// Pure logic only: no browser, no store.
import { paceOf, paceSamples, judgeBlocks, completion, progressText, PACE } from '../src/data/progress.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

const ws = Array(10).fill(60);                       // ten blocks of 60 words
const secs = (wpm) => Math.round((60 / wpm) * 60000); // ms to read one block at wpm
const sess = (wpm) => ws.map(() => secs(wpm));

check('no samples: prior', paceOf(null) === PACE.prior && paceOf({ s: [] }) === PACE.prior);
const fastS = paceSamples(ws, sess(500));
const slowS = paceSamples(ws, sess(200));
check('samples follow the reader', fastS.every((x) => x === 500) && slowS.every((x) => x === 200));
check('passes are not learned', paceSamples(ws, sess(1500)).length === 0);
check('short dwell is not learned', paceSamples(ws, ws.map(() => 300)).length === 0);
check('block still being read is skipped', paceSamples(ws, sess(300), 3).length === 9);
check('speeds clamp to the ceiling', paceSamples(ws, sess(800)).every((x) => x === PACE.max));

const fastPace = paceOf({ s: Array(60).fill(500) }), slowPace = paceOf({ s: Array(60).fill(200) });
check('pace is the median once trusted', fastPace === 500 && slowPace === 200);
check('few samples lean on the prior', paceOf({ s: [500] }) < 260 && paceOf({ s: [500] }) > PACE.prior);

// The same visit: 500 wpm on every block.
const visit = sess(500);
const asFast = judgeBlocks(ws, visit, fastPace), asSlow = judgeBlocks(ws, visit, slowPace);
check('fast reader at own pace: all read', asFast.readW === 600 && asFast.passW === 0);
check('same visit, slow reader: passed', asSlow.passW === 600 && asSlow.readW === 0);
check('2x own pace is still reading', judgeBlocks(ws, sess(fastPace * 2 - 1), fastPace).readW === 600);
check('3x own pace is passing', judgeBlocks(ws, sess(fastPace * 3), fastPace).passW === 600);
check('unseen blocks count as neither', judgeBlocks(ws, ws.map(() => 0), fastPace).readW === 0 && judgeBlocks(ws, [], fastPace).passW === 0);

const rec = (j, over = {}) => ({ kind: 'read', ms: 1000, depth: 1, ...j, ...over });
check('read at pace: done', completion(rec(asFast)).done && progressText(rec(asFast)).startsWith('read it'));
const skim = rec(judgeBlocks(ws, sess(1500), 240));
check('fast pass: skimmed, not done', !completion(skim).done && progressText(skim).startsWith('skimmed 100%'), progressText(skim));
const half = rec(judgeBlocks(ws, ws.map((_, i) => (i < 4 ? secs(240) : 0)), 240));
check('four of ten read: read 40%', !completion(half).done && progressText(half).startsWith('read 40%'), progressText(half));
const old = { kind: 'read', ms: 600000, depth: 0.9, minutes: 10, expectSec: 600 };
check('older records still work', completion(old).done);

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');
