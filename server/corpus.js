// Corpus builder — shared by the build-time script (scripts/build-corpus.mjs,
// writes the committed public/corpus.json fallback) and the daily refresh
// (api/corpus.js, run by Vercel Cron), so the Promenade stays fresh without a
// redeploy. Same sources, same scoring rules (src/scoring.js) either way.

import { scoreItem, DOMAINS, SLOTS } from '../src/scoring.js';

const TARGET = Number(process.env.CORPUS_TARGET || 260); // ~200-400 per spec
const HN_COUNT = 90;

// Deliberately spread sources — 6-10 topic areas with clean public feeds, so the
// diversity constraint has real spread to enforce. HN is the reliable backbone
// (real votes/comments); the RSS feeds pull the corpus off tech-only ground.
const RSS_SOURCES = [
  { url: 'https://www.quantamagazine.org/feed/', source: 'Quanta Magazine', hint: 'science' },
  { url: 'https://aeon.co/feed.rss', source: 'Aeon', hint: 'philosophy & ideas' },
  { url: 'https://nautil.us/feed/', source: 'Nautilus', hint: 'science' },
  { url: 'https://www.thisiscolossal.com/feed/', source: 'Colossal', hint: 'arts & culture' },
  { url: 'https://www.atlasobscura.com/feeds/latest', source: 'Atlas Obscura', hint: 'history' },
  { url: 'https://www.propublica.org/feed/main', source: 'ProPublica', hint: 'society & politics' },
  { url: 'https://feeds.arstechnica.com/arstechnica/science', source: 'Ars Technica Science', hint: 'science' },
  { url: 'https://www.smithsonianmag.com/rss/latest_articles/', source: 'Smithsonian', hint: 'history' },
];

// ---- fetch helpers ----------------------------------------------------------
const UA = { 'user-agent': 'MosaicCorpusBot/1.0 (+https://mosaic.example)' };
async function getJSON(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}
async function getText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// ---- Hacker News ------------------------------------------------------------
async function pullHN(n) {
  const ids = await getJSON('https://hacker-news.firebaseio.com/v0/topstories.json');
  const slice = ids.slice(0, n);
  const items = [];
  // Modest concurrency to be polite to the API.
  const CHUNK = 15;
  for (let i = 0; i < slice.length; i += CHUNK) {
    const batch = slice.slice(i, i + CHUNK);
    const got = await Promise.all(batch.map((id) =>
      getJSON(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)));
    for (const it of got) {
      if (!it || it.type !== 'story' || !it.title) continue;
      items.push({
        id: `hn-${it.id}`,
        title: decodeEntities(it.title),
        excerpt: it.text ? stripTags(decodeEntities(it.text)).slice(0, 400) : '',
        url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
        source: 'Hacker News',
        timestamp: (it.time || 0) * 1000,
        engagement: { votes: it.score || 0, comments: it.descendants || 0 },
        engagementModeled: false,
        _hint: 'technology', // source prior for title-only HN links
      });
    }
  }
  return items;
}

// ---- RSS / Atom (dependency-free parse) -------------------------------------
function decodeEntities(s = '') {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#8217;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“').replace(/&#8221;/g, '”').replace(/&hellip;/g, '…');
}
function stripTags(s = '') { return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function firstTag(block, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!m) return '';
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}
function atomLink(block) {
  const m = /<link[^>]*href="([^"]+)"[^>]*\/?>/i.exec(block);
  return m ? m[1] : '';
}

async function pullRSS({ url, source, hint }, cap = 20) {
  const xml = await getText(url);
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = isAtom
    ? xml.split(/<entry[\s>]/i).slice(1)
    : xml.split(/<item[\s>]/i).slice(1);
  const items = [];
  for (const b of blocks.slice(0, cap)) {
    const title = firstTag(b, 'title');
    const link = isAtom ? atomLink(b) : firstTag(b, 'link');
    if (!title || !link) continue;
    const desc = stripTags(firstTag(b, isAtom ? 'summary' : 'description')
      || firstTag(b, 'content') || firstTag(b, 'content:encoded'));
    const dateStr = firstTag(b, 'pubDate') || firstTag(b, 'updated') || firstTag(b, 'published');
    const ts = dateStr ? Date.parse(dateStr) : Date.now();
    const id = `rss-${hashString(link)}`;
    items.push({
      id,
      title,
      // Drop WordPress feed boilerplate ("The post X appeared first on Y.").
      excerpt: desc.replace(/\s*The (post|article) .{0,300}? appeared first on .{0,120}$/i, '').replace(/\s*Do stories and artists like this matter to you\?.*$/i, '').trim().slice(0, 400),
      url: link,
      source,
      timestamp: Number.isNaN(ts) ? Date.now() : ts,
      // RSS feeds don't expose votes/comments. To make the engagement column
      // realistic (and the contrast honest), model a plausible popularity from a
      // deterministic hash + recency. Flagged so the page can disclose it.
      engagement: modelEngagement(id, ts),
      engagementModeled: true,
      _hint: hint,
    });
  }
  return items;
}

function modelEngagement(seed, ts) {
  const h = hashString(seed);
  const ageDays = Math.max(0, (Date.now() - (ts || Date.now())) / 8.64e7);
  const freshness = Math.max(0.2, 1 - ageDays / 21);
  return {
    votes: Math.round((20 + (h % 380)) * freshness),
    comments: Math.round((3 + (h % 90)) * freshness),
  };
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// ---- LLM classifier transport (Node-side, opt-in) ---------------------------
// Only wired when MOSAIC_CLASSIFY=llm. Kept off by default: classifying hundreds
// of items through Groq's free tier is slow and rate-limited, and the committed
// corpus should be reproducible offline. When present, it calls Groq directly
// (this is build-time server code, so the key stays server-side by definition).
function makeClassifier() {
  if (process.env.MOSAIC_CLASSIFY !== 'llm' || !process.env.GROQ_API_KEY) return null;
  return async (prompt) => {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        reasoning_effort: 'low',
        max_completion_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `Groq ${res.status}`);
    return json.choices?.[0]?.message?.content || '';
  };
}

// ---- main -------------------------------------------------------------------
export async function buildCorpus({ log = console.log, warn = console.warn } = {}) {
  const apiKey = process.env.PERSPECTIVE_API_KEY || null;
  const classify = makeClassifier();
  log(`[corpus] scoring path: bridging=${apiKey ? 'Perspective' : 'heuristic'}, classify=${classify ? 'LLM' : 'heuristic'}`);

  // ---- gather ----
  const raw = [];
  try {
    const hn = await pullHN(HN_COUNT);
    log(`[corpus] Hacker News: ${hn.length} items`);
    raw.push(...hn);
  } catch (e) { warn(`[corpus] HN failed: ${e.message}`); }

  const perFeed = Math.ceil((TARGET - raw.length) / RSS_SOURCES.length) + 4;
  for (const src of RSS_SOURCES) {
    try {
      const items = await pullRSS(src, perFeed);
      log(`[corpus] ${src.source}: ${items.length} items`);
      raw.push(...items);
    } catch (e) {
      warn(`[corpus] ${src.source} failed: ${e.message}`);
    }
  }

  // Dedupe by URL, cap to target.
  const seen = new Set();
  const pool = [];
  for (const it of raw) {
    if (!it.url || seen.has(it.url)) continue;
    seen.add(it.url);
    pool.push(it);
    if (pool.length >= TARGET) break;
  }

  if (pool.length < 40) {
    throw new Error(`Only ${pool.length} items gathered — network likely blocked.`);
  }

  // ---- score every item ONCE through the shared module ----
  log(`[corpus] scoring ${pool.length} items…`);
  const scored = [];
  const perspAttrsUsed = new Set();
  const provenance = { perspective: 0, llm: 0, heuristic: 0 };
  for (let i = 0; i < pool.length; i++) {
    const s = await scoreItem(pool[i], { apiKey, classify });
    if (s.perspectiveAttributes) s.perspectiveAttributes.forEach((a) => perspAttrsUsed.add(a));
    provenance[s.scored_by] = (provenance[s.scored_by] || 0) + 1;
    // Drop the internal hint before persisting.
    delete s._hint;
    scored.push(s);
    if ((i + 1) % 25 === 0) log(`[corpus]   …${i + 1}/${pool.length}`);
  }

  const domainCounts = {};
  const slotCounts = {};
  for (const s of scored) {
    domainCounts[s.domain] = (domainCounts[s.domain] || 0) + 1;
    slotCounts[s.slot] = (slotCounts[s.slot] || 0) + 1;
  }

  const corpus = {
    meta: {
      generatedAt: new Date().toISOString(),
      count: scored.length,
      sources: ['Hacker News', ...RSS_SOURCES.map((s) => s.source)],
      domains: DOMAINS,
      slots: SLOTS,
      domainCounts,
      slotCounts,
      scoring: {
        bridgingFloor: 0.35,
        provenance,
        perspectiveAttributesUsed: [...perspAttrsUsed],
        note:
          'Bridging scores come from Perspective when a key is present, else the LLM classifier, else a deterministic heuristic (scored_by records which per item). ' +
          'The LLM/heuristic fallback is the deliberate Perspective-sunset migration path, not a stopgap. ' +
          'Non-Hacker-News engagement counts are modeled from recency + a deterministic hash (engagementModeled=true); HN counts are real.',
      },
    },
    items: scored,
  };

  log(`[corpus] built ${scored.length} items`, provenance);
  return corpus;
}
