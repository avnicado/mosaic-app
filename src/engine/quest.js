// Quests: a long learning journey held as a conversation with a guide.
//
// The guide GUIDES, it does not teach. It finds out where you are (level,
// what you know, what pulls you), keeps a map of the territory, and points you
// at real works by real people at the right level. It may orient you in a
// sentence or two; it never lectures the subject in place of the sources.
//
// Same hard rule as the feed: MODELS NEVER PRODUCE URLS. The guide only says
// what to look for; a search query goes to /api/search (Tavily) and a second
// call picks among the real results. A pick whose URL isn't a result is dropped.
//
// Pure module: takes plain data, returns plain data. src/data/quests.js owns storage.

import { callLLMJSON, apiFetch } from './llm.js';
import { clip } from './prompts.js';
import { verifyUrl } from './feed.js';
import { MEDIA_TYPES, TAG_FIELDS_SPEC, vocabHint, normalizeMediaType, normalizeField, normalizeTopics } from '../media.js';

export const LEVELS = ['gentle', 'steady', 'demanding'];
export const LEVEL_BLURB = {
  gentle: 'an easy way in',
  steady: 'takes some focus',
  demanding: 'dense, for when you are ready',
};

// How you said an item landed. Shapes the learner model and the next find.
export const REACTIONS = [
  { key: 'landed', label: 'This landed' },
  { key: 'too-hard', label: 'Too hard' },
  { key: 'too-easy', label: 'Too easy' },
  { key: 'known', label: 'Knew this already' },
  { key: 'not-for-me', label: 'Not for me' },
];
export const REACTION_WORDS = {
  landed: 'landed', 'too-hard': 'was too hard', 'too-easy': 'was too easy', known: 'was already known to them', 'not-for-me': 'was not for them',
};

const arr = (v, n = 12) => (Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean).slice(0, n) : []);
const str = (v, n = 2000) => String(v || '').trim().slice(0, n);

// ---- the context the guide sees ------------------------------------------------
// ctx: { title, learner, map, transcript:[{role, text, items?}], items:[{title, source, level, reaction, opened, progress, branch}], readElsewhere:[title] }
function learnerBlock(l = {}) {
  const lines = [];
  if (l.level) lines.push(`- Level on this subject: ${l.level}`);
  if (l.background) lines.push(`- Background: ${l.background}`);
  if (l.known?.length) lines.push(`- Already knows / has met: ${l.known.join('; ')}`);
  if (l.interests?.length) lines.push(`- Drawn to: ${l.interests.join('; ')}`);
  if (l.avoid?.length) lines.push(`- Not interested in / avoid: ${l.avoid.join('; ')}`);
  if (l.prefers?.length) lines.push(`- Prefers: ${l.prefers.join('; ')}`);
  return lines.length ? lines.join('\n') : '- Nothing known yet.';
}

function mapBlock(map = []) {
  if (!map.length) return 'No map yet.';
  return map.map((b) => `- [${b.status}] ${b.title}${b.why ? ` — ${clip(b.why, 120)}` : ''}${b.threadId ? ' (held as its own thread)' : ''}`).join('\n');
}

function itemsBlock(items = []) {
  if (!items.length) return 'Nothing pointed to yet.';
  return items.slice(-24).map((i) => {
    const bits = [i.level, i.branch && `on "${clip(i.branch, 50)}"`, i.reaction ? `they said it ${REACTION_WORDS[i.reaction]}` : i.opened ? 'opened, no reaction yet' : 'not opened yet', i.progress].filter(Boolean);
    return `- "${clip(i.title, 90)}" (${clip(i.source, 40)}) — ${bits.join(', ')}`;
  }).join('\n');
}

function transcriptBlock(transcript = []) {
  return transcript.slice(-14).map((m) => `${m.role === 'guide' ? 'GUIDE' : m.role === 'event' ? 'EVENT' : 'LEARNER'}: ${clip(m.text, m.role === 'guide' ? 600 : 900)}`).join('\n');
}

export const GUIDE_SYSTEM = `You are the guide in a learning quest on Mosaic. Mosaic is the opposite of a social-media feed: it exists so people grow into more thoughtful people, never to keep them clicking.

Your job is to GUIDE someone toward what to learn — NOT to teach it to them. You are a well-read librarian and mentor in one. You:
- find out where they actually are: their level on this subject, what they already know, what pulls them, what they don't care about;
- keep a MAP of the territory: the 4-7 main regions of the subject, in plain names, so they can see the shape of it and choose;
- point them to real works by real people (a talk, an essay, a chapter, a lecture, a podcast episode) at the RIGHT level for them, one step at a time — not a reading list;
- listen to how things landed (too hard, too easy, already known, landed) and adjust;
- notice when a real question of their own appears, and name it — it can become its own thread.

Rules:
- Do not explain the subject at length. At most one or two plain sentences of orientation ("Bayes is about updating how sure you are when new evidence comes in"). The learning happens in the sources and in their own thinking.
- Be conversational and brief: 2-5 sentences. No praise or filler openers ("Great", "Good question"); start with substance.
- The map is shown beside the conversation. Don't list its regions in your reply; refer to one or two by name when it helps.
- Keep "learner.level" current: as soon as anything they say shows where they stand, write it as one short phrase (e.g. "has read popular books; new to the formal side"). Ask at most ONE question per turn, and only when the answer would change what you point to.
- On the first turn of a broad request, do not dump sources. Sketch the map (in "map.add" — never as a numbered or bulleted list in your reply), and ask the one question that matters most (usually: what drew them to it, or what they already know). If they already told you enough, you may find a first step right away.
- Never steer them toward a conclusion or a side. You deepen; you don't recruit.
- Never invent sources, titles or URLs in your reply. When something should be found, request it in "find" — the system searches the real web for it and shows the results under your reply.
- When you request a find, say in your reply what you are looking for and why, in a few words. Don't name specific works you haven't been shown.
- Respect what they've said: never point to something they said they know, found too hard, or don't want.

Output ONLY valid JSON, no prose around it:
{
  "title": "a short name for the quest, 1-4 words (keep the existing one unless it's clearly wrong)",
  "reply": "your message to them",
  "learner": {
    "level": "one short phrase, or empty to keep",
    "background": "one short phrase about their relevant background, or empty to keep",
    "known_add": ["things they've shown they already know or have read"],
    "interests_add": ["what pulls them"],
    "avoid_add": ["what they don't want"],
    "prefers_add": ["formats, lengths or styles they prefer"]
  },
  "map": {
    "add": [{"title": "a region of the subject, plain words", "why": "one sentence: what's there and why it might matter to them"}],
    "focus": "the exact title of the map region this turn is about, or empty"
  },
  "find": null OR {
    "what": "what to look for, specifically (the idea, the angle, the kind of work)",
    "level": "gentle | steady | demanding — what fits them NOW",
    "count": 1-3,
    "region": "the exact map region title it belongs to, or empty"
  },
  "question": "if a real question of their own has surfaced, write it in their voice — otherwise empty"
}`;

export function guidePrompt(ctx, message) {
  return `Quest: "${ctx.title || '(not named yet)'}"

What you know about the learner:
${learnerBlock(ctx.learner)}

The map so far:
${mapBlock(ctx.map)}

What you've pointed them to on this quest, and how it went:
${itemsBlock(ctx.items)}
${ctx.readElsewhere?.length ? `\nThings they've already opened elsewhere in Mosaic (don't point to these again): ${ctx.readElsewhere.slice(0, 30).map((t) => `"${clip(t, 60)}"`).join('; ')}\n` : ''}
The conversation so far:
${transcriptBlock(ctx.transcript) || '(none — this is the start)'}

LEARNER: ${message}

Reply as the guide.`;
}

// → { title, reply, learner:{...}, map:{add, focus}, find|null, question }
export async function guideTurn(ctx, message) {
  const r = await callLLMJSON({ system: GUIDE_SYSTEM, prompt: guidePrompt(ctx, message), maxTokens: 1800 });
  const l = r.learner || {};
  const f = r.find && typeof r.find === 'object' && str(r.find.what) ? r.find : null;
  return {
    title: str(r.title, 60),
    reply: str(r.reply, 2400) || 'Tell me a little more about what you are after.',
    learner: {
      level: str(l.level, 120), background: str(l.background, 160),
      known: arr(l.known_add), interests: arr(l.interests_add), avoid: arr(l.avoid_add), prefers: arr(l.prefers_add),
    },
    map: {
      add: (Array.isArray(r.map?.add) ? r.map.add : []).map((b) => ({ title: str(b?.title, 80), why: str(b?.why, 240) })).filter((b) => b.title).slice(0, 8),
      focus: str(r.map?.focus, 80),
    },
    find: f && {
      what: str(f.what, 400),
      level: LEVELS.includes(f.level) ? f.level : 'steady',
      count: Math.min(3, Math.max(1, Number(f.count) || 1)),
      region: str(f.region, 80),
    },
    question: str(r.question, 300),
  };
}

// ---- finding real works --------------------------------------------------------
const findContext = (ctx, need) => `The learner's quest: "${ctx.title}"
${learnerBlock(ctx.learner)}
${need.region ? `The region of the subject: "${need.region}"\n` : ''}What the guide wants found: ${need.what}
Level that fits them now: ${need.level} (${LEVEL_BLURB[need.level]})`;

const queryPrompt = (ctx, need, tried) => `You are writing ONE web-search query for a learning guide on Mosaic.

${findContext(ctx, need)}

Write the query a sharp research librarian would type to surface specific, substantial works (a talk, lecture, essay, chapter, interview, podcast episode) by real people that fit THIS learner at THIS level. Avoid listicles, SEO pages, course-sales pages and generic overviews. For a gentle level prefer clear introductions by people who really know the subject (a good talk or a well-written essay), not textbooks.${tried.length ? `\nAlready tried (write a different query): ${tried.join(' | ')}` : ''}

Output ONLY valid JSON: {"query": "the search query"}`;

const selectPrompt = (ctx, need, results, count) => `You are choosing works for a learner on Mosaic from REAL web search results.

${findContext(ctx, need)}

The candidates (real results — these URLs exist):
${results.map((r, i) => `${i + 1}. ${r.title}\n   url: ${r.url}\n   ${clip(r.snippet, 300)}`).join('\n')}

Choose up to ${count} that best fit this learner at this level — fewer if only fewer are good. A specific work by a specific person beats an overview. Skip listicles, content farms, paywalled course pages, and anything too advanced or too basic for them. Choose none (an empty list) if nothing fits.

For each, judge its level HONESTLY from what you can see: gentle (easy way in), steady (takes some focus), demanding (dense).

CRITICAL: "url" MUST be copied character-for-character from the chosen candidate.

Output ONLY valid JSON:
{"picks": [{
  "title": "the work's actual title",
  "source": "author, publication, channel, or speaker",
  "url": "verbatim from the candidate",
  "mediaType": "one of: ${MEDIA_TYPES.join(', ')}",
  "level": "gentle | steady | demanding",
  "preview": "1-2 sentences: what is in it",
  "why": "1-2 sentences, to the learner: why this one, for you, now",
${TAG_FIELDS_SPEC}
}]}${vocabHint(ctx.vocab)}`;

async function search(query) {
  const res = await apiFetch('/api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, maxResults: 8 }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 && data?.error?.type === 'no_search_key') throw new Error('search is not configured on this server');
  if (!res.ok) throw new Error(data?.error?.message || `search error (${res.status})`);
  return data.results || [];
}

// → [{ title, source, url, mediaType, level, preview, why, field, topics, provenance, linkCheck, query }]
export async function findWorks(ctx, need, exclude = []) {
  const ex = new Set(exclude);
  const out = [];
  const tried = [];
  for (let round = 0; round < 2 && out.length < need.count; round++) {
    const { query } = await callLLMJSON({ prompt: queryPrompt(ctx, need, tried), maxTokens: 500 });
    if (!query || !String(query).trim()) break;
    tried.push(String(query));
    const results = (await search(String(query))).filter((r) => !ex.has(r.url));
    if (!results.length) continue;
    const sel = await callLLMJSON({ prompt: selectPrompt(ctx, need, results, need.count - out.length), maxTokens: 1800 });
    for (const p of Array.isArray(sel.picks) ? sel.picks : []) {
      const match = results.find((r) => r.url === p.url) || results.find((r) => p.url && (r.url.startsWith(p.url) || String(p.url).startsWith(r.url)));
      if (!match || ex.has(match.url)) continue; // not a real result, or a repeat: dropped
      const linkCheck = await verifyUrl(match.url);
      if (linkCheck === 'dead') continue;
      ex.add(match.url);
      out.push({
        title: str(p.title, 200) || match.title, source: str(p.source, 120), url: match.url,
        mediaType: normalizeMediaType(p.mediaType, match.url),
        level: LEVELS.includes(p.level) ? p.level : need.level,
        preview: str(p.preview, 500), why: str(p.why, 500),
        field: normalizeField(p.field), topics: normalizeTopics(p.topics),
        provenance: 'search', linkCheck, query: String(query),
      });
      if (out.length >= need.count) break;
    }
  }
  return out;
}
