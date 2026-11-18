// Headless check of piece lengths (server/length.js, src/length.js): feed
// text, page words, stated running times, the estimate, and the budget.
// No network: pages come from a stub fetch, addresses from a stub DNS.
//   node scripts/length-smoke.mjs
import dns from 'node:dns/promises';
import { proseWords, lengthFromFeedHtml, statedSeconds, measurePage, measureMany } from '../server/length.js';
import { withLength, estimateMinutes, isoSeconds, lengthText, fmtMinutes } from '../src/length.js';

let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

dns.lookup = async (host) => (host === 'inside.example' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);

const words = (n) => Array.from({ length: n }, (_, i) => `word${i % 7 ? '' : 's'}`).join(' ');
const page = (body) => `<html><head><script>var x = "${words(900)}";</script></head><body><nav><p>${words(300)}</p></nav>${body}<footer><p>${words(200)}</p></footer></body></html>`;
const PAGES = {
  'https://a.example/essay': page(`<article><h2>Title</h2>${Array.from({ length: 12 }, () => `<p>${words(200)}</p>`).join('')}<img src="x"></article>`),
  'https://a.example/teaser': page('<main><p>Subscribe to read the rest.</p></main>'),
  'https://www.youtube.com/watch?v=abc': '<html><script>var ytInitialPlayerResponse = {"videoDetails":{"lengthSeconds":"1834"}};</script></html>',
  'https://pod.example/ep': '<html><meta itemprop="duration" content="PT1H12M"><p>Show notes</p></html>',
  'https://a.example/slow': 'SLOW',
  'https://a.example/redir': 'REDIRECT',
};
let fetched = [];
const stubFetch = async (url) => {
  fetched.push(url);
  const body = PAGES[url];
  if (body === 'SLOW') await new Promise((r) => setTimeout(r, 3000));
  if (body === 'REDIRECT') return new Response('', { status: 302, headers: { location: 'http://inside.example/x' } });
  if (!body) return new Response('nope', { status: 404 });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
};

// ---- words in paragraphs ----
const pw = proseWords(PAGES['https://a.example/essay']);
check('page words come from the article, not nav, footer or scripts', pw.words === 2401 && pw.images === 1, JSON.stringify(pw));
const essay = await measurePage('https://a.example/essay', { fetchImpl: stubFetch });
check('an essay of 2,400 words is about 11 minutes, measured', essay?.minutes === 11 && essay.length_by === 'page', JSON.stringify(essay));
check('a teaser page gives no length', (await measurePage('https://a.example/teaser', { fetchImpl: stubFetch })) === null);
check('a 404 gives no length', (await measurePage('https://a.example/none', { fetchImpl: stubFetch })) === null);
fetched = [];
check('a redirect to an internal address is refused before fetching it', (await measurePage('https://a.example/redir', { fetchImpl: stubFetch })) === null && !fetched.includes('http://inside.example/x'), fetched.join(','));

// ---- running times ----
const yt = await measurePage('https://www.youtube.com/watch?v=abc', { fetchImpl: stubFetch });
check('a YouTube page gives its running time', yt?.minutes === 31 && yt.length_by === 'player', JSON.stringify(yt));
const pod = await measurePage('https://pod.example/ep', { fetchImpl: stubFetch });
check('a schema.org duration gives the running time', pod?.minutes === 72 && pod.length_by === 'player', JSON.stringify(pod));
check('ISO durations parse', isoSeconds('PT1H2M3S') === 3723 && isoSeconds('PT45M') === 2700 && isoSeconds('P') === null && isoSeconds('nonsense') === null);
check('og:video:duration parses', statedSeconds('<meta property="og:video:duration" content="600">') === 600);

// ---- feeds ----
check('a feed summary gives no length', lengthFromFeedHtml(`<p>${words(80)}</p>`) === null);
const feed = lengthFromFeedHtml(`<p>${words(1150)}</p><img src=a><img src=b>`);
check('a feed with the whole text gives its length', feed?.minutes === 5 && feed.length_by === 'feed', JSON.stringify(feed));

// ---- many, inside a budget ----
const items = [
  { url: 'https://a.example/essay' }, { url: 'https://a.example/slow' }, { url: 'https://a.example/teaser' },
  { url: 'https://news.ycombinator.com/item?id=1' }, { url: 'https://a.example/already', minutes: 4, length_by: 'feed' },
];
fetched = [];
const t0 = Date.now();
const n = await measureMany(items, { budgetMs: 1500, timeoutMs: 1000, fetchImpl: stubFetch });
const took = Date.now() - t0;
check('measuring many keeps to its budget', took < 1700, `${took}ms`);
check('measuring many fills what it can and skips the rest', n === 1 && items[0].minutes === 11 && !items[1].minutes && !items[2].minutes);
check('a Hacker News discussion and an already-measured piece are not fetched', !fetched.some((u) => /ycombinator|already/.test(u)), fetched.join(','));

// ---- the estimate ----
check('an unmeasured Aeon essay is estimated from its source', estimateMinutes({ url: 'https://aeon.co/essays/x', source: 'Aeon' }) === 20);
check('a YouTube link is estimated as a video', estimateMinutes({ url: 'https://youtu.be/x', source: 'Hacker News' }) === 15);
const est = withLength({ url: 'https://example.org/x', source: 'Hacker News' });
check('an item without a length gets an estimate, marked', est.minutes === 8 && est.length_by === 'estimate');
const kept = withLength({ url: 'https://example.org/x', minutes: 33, length_by: 'player' });
check('a measured length is kept', kept.minutes === 33 && kept.length_by === 'player');
check('lengths read plainly', lengthText(est) === 'about 8 min' && lengthText(kept) === '33 min' && fmtMinutes(95) === '1 hr 35 min');

console.log(failed ? `\n${failed} length check(s) FAILED` : '\nall length checks passed');
process.exit(failed ? 1 : 0);
