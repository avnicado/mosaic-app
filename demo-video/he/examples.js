// The ready examples in Hebrew, for the demo video's Hebrew cut only.
// Translated from src/viewsdemo/examples/*.json (see make_he_page.py and
// examples/strings.he.json). Names of people and outlets stay as written.
import { normalizeMap } from '../../src/engine/viewsDemo.js';
import vaccines from './examples/vaccines.json';
import social from './examples/social.json';
import nuclear from './examples/nuclear.json';

const PREPARED = 'נובמבר 2026';

export const EXAMPLES = [
  ['vaccines', vaccines], ['kids-social-media', social], ['nuclear', nuclear],
].map(([id, raw]) => ({ ...normalizeMap({ status: 'mapped', ...raw }), id, preparedOn: PREPARED }));

// Letters of any script, so a Hebrew question finds its example.
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const exampleFor = (q) => (norm(q) ? EXAMPLES.find((e) => norm(e.question) === norm(q)) || null : null);
