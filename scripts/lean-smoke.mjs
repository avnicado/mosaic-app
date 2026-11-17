// Headless check of the Promenade lean: parts and composeLeanShelf.
//   node scripts/lean-smoke.mjs [path/to/corpus.json]
// Pure logic only: no server, no store. Defaults to the committed public/corpus.json.
import fs from 'node:fs';
import {
  heuristicPart, heuristicDensity, composeLeanShelf, emptyLean, hasLean, inLeanArea,
  hunchStems, nearHunch, PARTS, DOMAINS, BRIDGING_FLOOR, LEAN_SHELF_SIZE, buildClassifyPrompt,
} from '../src/scoring.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

// ---- parts ----
check('every field has four parts', DOMAINS.every((d) => PARTS[d]?.length === 4));
check('compiler + GPU is computing', heuristicPart({ title: 'A Rust compiler for GPUs' }, 'technology') === 'computing');
check('a city housing piece is cities', heuristicPart({ title: 'Why rent keeps rising in American cities' }, 'society & politics') === 'cities');
check('"general" does not match "gene"', heuristicPart({ title: 'A general note' }, 'science') === null);
check('no cue gives no part', heuristicPart({ title: 'Untitled' }, 'history') === null);
check('the classifier is asked for a part', /"part":/.test(buildClassifyPrompt({ title: 'x' })) && buildClassifyPrompt({ title: 'x' }).includes('repair | tools | materials | workshops'));

// ---- the lean shelf, on a real pool ----
const file = process.argv[2] || new URL('../public/corpus.json', import.meta.url);
const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
const pool = corpus.items.map((it) => ({
  ...it,
  part: it.part === undefined ? heuristicPart(it) : it.part,
  scores: { ...it.scores, density: typeof it.scores?.density === 'number' ? it.scores.density : heuristicDensity(it) },
}));
const L = (o) => ({ ...emptyLean(), ...o });
const urls = (s) => s.picks.map((p) => p.url);

check('an empty lean is no lean', !hasLean(emptyLean()) && hasLean(L({ ring: 2 })) && hasLean(L({ hunch: 'maps' })));

const leans = [
  L({ fields: ['science'] }),
  L({ fields: ['technology'], ring: 2 }),
  L({ fields: ['history', 'arts & culture'], mood: 'ground' }),
  L({ fields: ['technology'], parts: { technology: ['devices'] }, ring: 2 }),
  L({ fields: ['society & politics'], mood: 'bridge' }),
  L({ ring: 2, hunch: 'something about cities' }),
  L({ fields: ['craft & making'], ring: 4 }),
];
for (const lean of leans) {
  const s = composeLeanShelf(pool, lean);
  const tag = JSON.stringify({ f: lean.fields, p: lean.parts, r: lean.ring, m: lean.mood, h: lean.hunch });
  check(`finite (≤${LEAN_SHELF_SIZE}) ${tag}`, s.picks.length <= LEAN_SHELF_SIZE);
  check(`no repeats ${tag}`, new Set(urls(s)).size === s.picks.length);
  check(`admitted only ${tag}`, s.picks.every((p) => p.scores.bridging >= BRIDGING_FLOOR));
  check(`inside the lit area unless marked elsewhere ${tag}`, s.picks.every((p) => p.elsewhere || inLeanArea(p, lean)));
  const away = s.picks.filter((p) => p.elsewhere);
  check(`elsewhere only for the bridge mood, ≤2, bridge moves, distinct fields ${tag}`,
    (lean.mood === 'bridge' || away.length === 0) && away.length <= 2
    && away.every((p) => p.slot === 'bridge' && !lean.fields.includes(p.domain))
    && new Set(away.map((p) => p.domain)).size === away.length);
  check(`thin leans are not padded ${tag}`, s.picks.length === LEAN_SHELF_SIZE || s.left === 0, `picks ${s.picks.length}, left ${s.left}`);
  console.log('     ', s.picks.length, 'picks from an area of', s.areaCount);
}

// Held and already-seen items stay off the shelf; Recompose moves on.
const sci = L({ fields: ['science'] });
const first = composeLeanShelf(pool, sci);
const held = new Set([first.picks[0].url]);
const second = composeLeanShelf(pool, sci, { held, exclude: new Set(urls(first).slice(1)) });
check('held and seen cards stay off the next shelf', second.picks.every((p) => !urls(first).includes(p.url)));
check('the area count leaves out what you hold', second.areaCount === first.areaCount - 1);

// A hunch only lifts what's already in the lean.
const hunch = L({ fields: ['society & politics'], hunch: 'cities housing rent' });
const hs = composeLeanShelf(pool, hunch);
const stems = hunchStems(hunch.hunch);
const matching = pool.filter((it) => it.scores.bridging >= BRIDGING_FLOOR && inLeanArea(it, hunch) && nearHunch(it, stems)).length;
check('hunch items come first', hs.picks.slice(0, Math.min(matching, 3)).every((p) => p.nearHunch), JSON.stringify(hs.picks.map((p) => p.nearHunch)));
check('hunch never reaches outside the lean', hs.picks.every((p) => p.domain === 'society & politics'));
check('stop words are dropped from a hunch', JSON.stringify(hunchStems('something about the cities')) === '["city"]');

console.log(failed ? `LEAN PROBLEM (${failed} failed)` : 'LEAN OK');
process.exit(failed ? 1 : 0);
