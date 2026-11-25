// Checks the release notes (src/releases.js) against package.json's version.
// The build runs the same check from vite.config.js.
import { readFileSync } from 'node:fs';
import { RELEASES, checkReleases } from '../src/releases.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const problems = checkReleases(pkg.version);
if (problems.length) {
  console.error('Release notes check failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Release notes OK: ${RELEASES.length} versions, current ${pkg.version}.`);
