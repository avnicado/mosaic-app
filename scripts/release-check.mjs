// Stops the build when package.json's version and the newest release note
// (src/releases.js) disagree, or when the notes are out of order.
import { readFileSync } from 'node:fs';
import { RELEASES, compareVersions } from '../src/releases.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const problems = [];
if (pkg.version !== RELEASES[0].version) {
  problems.push(`package.json is ${pkg.version} but the newest release note is ${RELEASES[0].version}.`);
}
for (let i = 0; i < RELEASES.length; i++) {
  const r = RELEASES[i];
  if (!/^\d+\.\d+\.\d+$/.test(r.version)) problems.push(`${r.version}: not x.y.z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) problems.push(`${r.version}: date must be YYYY-MM-DD`);
  if (!r.title || !r.changes?.length) problems.push(`${r.version}: needs a title and at least one change`);
  for (const c of r.changes || []) if (!['new', 'better', 'fixed'].includes(c.kind)) problems.push(`${r.version}: unknown kind "${c.kind}"`);
  if (i && compareVersions(RELEASES[i - 1].version, r.version) <= 0) problems.push(`${RELEASES[i - 1].version} should be newer than ${r.version} (newest first).`);
}
if (problems.length) {
  console.error('Release notes check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Release notes OK: ${RELEASES.length} versions, current ${pkg.version}.`);
