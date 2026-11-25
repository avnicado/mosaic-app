// Lists every string passed to t() / tp() in src/ that has no Hebrew entry,
// and Hebrew entries no call site uses any more. Exit 1 if any are missing.
//   npm run i18n-check
import fs from 'node:fs';
import path from 'node:path';
import he from '../src/i18n/he/index.js';
import common from '../src/i18n/he/common.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== 'i18n') walk(p); }
    else if (/\.(jsx?|mjs)$/.test(f.name)) files.push(p);
  }
})(root);

const lit = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|\x60(?:[^\x60\\$]|\\.)*\x60`;
const reT = new RegExp(String.raw`\bt\(\s*(${lit})`, 'g');
const reTp = new RegExp(String.raw`\btp\(\s*[^,]+,\s*(${lit})\s*,\s*(${lit})`, 'g');
const unq = (s) => Function(`return ${s}`)();

const used = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const add = (s) => { const k = unq(s); if (!used.has(k)) used.set(k, path.relative(root, f)); };
  for (const m of src.matchAll(reT)) add(m[1]);
  for (const m of src.matchAll(reTp)) { add(m[1]); add(m[2]); }
}
const missing = [...used].filter(([k]) => he[k] == null);
const unused = Object.keys(he).filter((k) => !used.has(k) && !(k in common)); // common.js is also looked up from fixed lists
// {n} may be dropped (a singular form can spell out "one").
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).filter((p) => p !== '{n}').sort().join();
const badPh = [...used].filter(([k]) => he[k] != null && ph(k) !== ph(he[k]));
console.log(`${used.size} strings in use, ${Object.keys(he).length} Hebrew entries.`);
if (missing.length) { console.log(`\nMissing Hebrew (${missing.length}):`); for (const [k, f] of missing) console.log(`  ${f}: ${JSON.stringify(k)}`); }
if (badPh.length) { console.log(`\nPlaceholders differ (${badPh.length}):`); for (const [k] of badPh) console.log(`  ${JSON.stringify(k)} → ${JSON.stringify(he[k])}`); }
if (unused.length) { console.log(`\nUnused Hebrew entries (${unused.length}):`); for (const k of unused) console.log(`  ${JSON.stringify(k)}`); }
process.exit(missing.length ? 1 : 0);
