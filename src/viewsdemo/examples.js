// Ready examples for the views page: researched by hand, every link opened
// and read to confirm it says what it's cited for (see examples/*.json).
// They cost nothing to show: no model call, no search.
import { normalizeMap } from '../engine/viewsDemo.js';
import vaccines from './examples/vaccines.json';
import social from './examples/social.json';
import nuclear from './examples/nuclear.json';

const PREPARED = 'November 2026';

export const EXAMPLES = [
  ['vaccines', vaccines], ['kids-social-media', social], ['nuclear', nuclear],
].map(([id, raw]) => ({ ...normalizeMap({ status: 'mapped', ...raw }), id, preparedOn: PREPARED }));

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const exampleFor = (q) => EXAMPLES.find((e) => norm(e.question) === norm(q)) || null;
