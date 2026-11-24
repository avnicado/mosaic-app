// Replays the new rules over the search results and pieces recorded in the
// first run. No model calls, no searches: the same bytes, the new filters.
import fs from 'node:fs';
const { notAnArgument, standingOf, hostOf } = await import(new URL('../../src/engine/viewsDemo.js', import.meta.url).href);
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// 1. What the new usable() removes from what the model was offered.
let offered = 0, removed = 0;
const removedHosts = new Map();
for (const r of d.results) for (const s of r.search) for (const x of s.results) {
  offered++;
  if (notAnArgument(x.url)) { removed++; removedHosts.set(hostOf(x.url), (removedHosts.get(hostOf(x.url)) || 0) + 1); }
}
console.log('RESULTS THE MODEL WAS OFFERED');
console.log(`  ${offered} results; the new rule removes ${removed} (${(100*removed/offered).toFixed(1)}%) before the model sees them`);
console.log('  top hosts removed:');
for (const [h, n] of [...removedHosts].sort((a,b)=>b[1]-a[1]).slice(0, 14)) console.log(`    ${String(n).padStart(3)}  ${h}`);

// 2. Which pieces that reached a reader would now be gone, and which labelled.
const pieces = [];
for (const r of d.results) for (const e of r.rings) for (const x of (e.reading || [])) pieces.push({ q: r.q, ring: e.question, side: x.side, ans: x.side === 'left' ? e.left : e.right, ...x });
console.log(`\nPIECES SHOWN TO A READER: ${pieces.length}`);
const gone = pieces.filter((x) => notAnArgument(x.url));
console.log(`\n  DROPPED by the not-an-argument rule: ${gone.length}`);
for (const x of gone) console.log(`    ${hostOf(x.url).padEnd(20)} "${x.ans}"  ${x.q.slice(0,34)}`);
const labelled = pieces.filter((x) => standingOf(x.url));
console.log(`\n  LABELLED with a standing: ${labelled.length} of ${pieces.length}`);
const byLab = new Map();
for (const x of labelled) byLab.set(standingOf(x.url), (byLab.get(standingOf(x.url)) || 0) + 1);
for (const [l, n] of [...byLab].sort((a,b)=>b[1]-a[1])) console.log(`    ${String(n).padStart(3)}  ${l}`);
console.log('\n  the pieces whose credential changes most:');
for (const x of labelled) {
  const s = standingOf(x.url);
  if (!/Peer reviewed|University/.test(s)) console.log(`    [${s}] credited as "${x.outlet}"\n       ${x.url.slice(0,100)}\n       ${x.q.slice(0,46)} | side "${x.ans}"`);
}

// 3. Per-side counts on the settled question, before and after.
console.log('\nDO VACCINES CAUSE AUTISM? — each side, after the rules');
for (const r of d.results.filter((x) => /vaccines cause autism/.test(x.q))) for (const e of r.rings) {
  if (!(e.reading || []).length) continue;
  console.log(`  RING: ${e.question}`);
  for (const side of ['left', 'right']) {
    const xs = (e.reading || []).filter((x) => x.side === side && !notAnArgument(x.url));
    console.log(`    ${side === 'left' ? 'A' : 'B'} "${side === 'left' ? e.left : e.right}": ${xs.length} pieces`);
    for (const x of xs) console.log(`        ${standingOf(x.url) || '(no label)'} — ${x.outlet} <${hostOf(x.url)}>`);
  }
}
