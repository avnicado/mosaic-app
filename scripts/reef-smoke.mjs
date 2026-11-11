// Headless check of the reef's data rules and the quiet-thread offer:
//   node scripts/reef-smoke.mjs
// Pure logic only: no server, no store.
import { colonies } from '../src/ui/coral/derive.js';
import { growColony, FORMS } from '../src/ui/coral/geometry.js';
import { returnOffer } from '../src/data/dormant.js';

const DAY = 864e5, now = Date.parse('2026-10-04T12:00:00Z');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

const th = (id, over = {}) => ({ id, articulations: [{ text: `Question ${id}`, at: now - 90 * DAY }], status: 'active', createdAt: now - 90 * DAY, touchedAt: now - DAY, parentId: null, synthesis: '', ...over });
const ses = (id, threadId, verdict, over = {}) => ({ id, threadId, openedAt: now - 5 * DAY, closedAt: now - 4 * DAY, diff: verdict ? { verdict } : null, note: '', ...over });

const threads = [
  th('deep'), th('reword'), th('busy'), th('old', { touchedAt: now - 60 * DAY }), th('old2', { touchedAt: now - 45 * DAY }),
  th('kid', { parentId: 'deep' }), th('kid2', { parentId: 'deep' }), th('shut', { status: 'closed', touchedAt: now - 200 * DAY }),
];
const sessions = [
  ses('s1', 'deep', 'real'), ses('s2', 'deep', 'real'), ses('s3', 'deep', 'real', { note: 'a note' }), ses('s4', 'deep', 'cosmetic'),
  ses('s5', 'reword', 'cosmetic'), ses('s6', 'reword', 'cosmetic'),
  ...Array.from({ length: 15 }, (_, i) => ses(`b${i}`, 'busy', null, { closedAt: null })), // opened, never judged
  ses('o1', 'old', 'real'), ses('o2', 'old', 'real'), ses('o3', 'old2', 'cosmetic'),
];
const items = [{ id: 'i1', threadId: 'busy', notes: [{ text: 'n', at: 1 }, { text: 'm', at: 2 }], signal: 'moved' }];
const by = Object.fromEntries(colonies({ threads, sessions, items }, now).map((c) => [c.id, c]));

check('polyps = real sessions', by.deep.real === 3 && growColony(by.deep).polyps.length === 3);
check('rewording alone has zero depth', by.reword.depth === 0 && by.reword.real === 0 && growColony(by.reword).polyps.length === 0);
check('activity alone grows nothing', by.busy.real === 0 && by.busy.depth === 0 && growColony(by.busy).polyps.length === 0);
check('bare colony stays small', growColony(by.busy).height < 40, String(growColony(by.busy).height));
check('depth rises with real movement', by.deep.depth > by.reword.depth && by.deep.depth < 1);
check('more movement, more reach', growColony(by.deep).height > growColony(by.busy).height);
check('spawned threads counted', by.deep.spawned === 2 && growColony(by.deep).buds.length === 2);
check('notes counted as pearls', by.deep.reflections === 1 && by.busy.reflections === 2 && growColony(by.busy).pearls.length === 2);
check('dormant after 30 days', by.old.dormant && by.old2.dormant && !by.deep.dormant);
check('closed is not dormant', by.shut.closed && !by.shut.dormant);
check('deterministic', JSON.stringify(growColony(by.deep)) === JSON.stringify(growColony(colonies({ threads, sessions, items }, now).find((c) => c.id === 'deep'))));
const ids = ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'i9', 'j10', 'k11', 'l12'];
const forms = new Set(ids.map((id) => growColony({ ...by.deep, seed: [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) }).form));
check('several silhouettes appear', forms.size >= 3, [...forms].join());
check('colony fits its slot', ids.every((id, i) => { const g = growColony({ ...by.deep, real: 40, depth: 0.97, seed: i * 7919 + 3 }); return g.width <= 150 && g.height <= 170; }));
check('many polyps do not crash', growColony({ ...by.deep, real: 120, depth: 0.99 }).polyps.length === 120);

const offer = returnOffer(threads, sessions, now);
check('offers the quiet thread that moved most', offer?.thread.id === 'old' && offer.real === 2, JSON.stringify(offer && offer.thread.id));
const answered = threads.map((t) => (t.id === 'old' ? { ...t, returnOffer: { at: now - 2 * DAY, did: 'later' } } : t));
check('answered offer is not repeated', returnOffer(answered, sessions, now)?.thread.id === 'old2');
const woke = threads.map((t) => (t.id === 'old' ? { ...t, returnOffer: { at: now - 70 * DAY, did: 'later' } } : t));
check('offered again in a new quiet spell', returnOffer(woke, sessions, now)?.thread.id === 'old');
check('no quiet thread, no offer', returnOffer(threads.filter((t) => !t.id.startsWith('old')), sessions, now) === null);
console.log('forms:', FORMS.join(', '));
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
