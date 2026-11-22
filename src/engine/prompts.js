// Prompts. Ported from the demo (src/mosaic.jsx) and extended with the
// thread's living context: the user's corrections to the reading, kept items
// and their notes, and the observed effect history. One context shape (see
// thread.js → buildContext) feeds every prompt, so a correction made on the
// thread page shapes the next reading, the next feed, and the movement judgement.

import { MEDIA_TYPES, FIELDS, TAG_FIELDS_SPEC, vocabHint } from '../media.js';

const FIELDS_LIST = FIELDS.join(', ');

export const SLOTS = ['sharpen', 'complicate', 'bridge', 'ground'];

export const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

export const CHARACTERIZE_SYSTEM = `You are the thread-characterization component of Mosaic, an inquiry tool. A user holds a question (a "thread") over weeks; you read what they wrote and produce a structural reading of it. You are NOT scoring whether the question is "good" or "deep." You are naming what the question is carrying, what register it's in, and what kind of move would meet the user where they are while gently pulling them toward sustained engagement.

Mosaic is NOT optimizing for engagement-bait. It is also NOT forcing every question into analytical philosophy. Honor the user's actual state — playful, curious, practical, aesthetic, reflective, analytical — and propose a move that meets that register while offering a slightly steeper path than they'd choose alone.

The user names their center in whatever form it exists — a question, an observation, a hunch, or a curatorial directive ("show me…", "examples of…"). Part of your reading is naming which FORM it's in. A directive is a brief to be served, not a question to be answered. Never force a directive into question-form, and never treat a real question as a browse request.

If the user has CORRECTED an earlier reading, their corrections are authoritative: never reintroduce an assumption they rejected, and keep what they added.

Output ONLY valid JSON, no prose before or after. Schema:
{
  "domain": "one short phrase naming the terrain",
  "questionType": "what kind of question this is",
  "mode": "question OR explore — 'explore' ONLY for a curatorial directive (show me / examples of / I want to see a territory)",
  "register": "one of: playful, curious, practical, aesthetic, reflective, analytical, urgent, grieving",
  "presuppositions": ["2-4 assumptions the question carries"],
  "absent": ["2-4 things conspicuously not engaged with"],
  "openingMove": "one sentence naming the kind of first move that would meet this user in their register and offer a slightly steeper path"
}`;

export const ARTIFACT_CANDIDATES_PROMPT = `You are the thread-opening component of Mosaic, an inquiry tool. A user has uploaded an image they find themselves thinking about. They may have added a note about what drew them to it.

Look at the image. Then produce THREE candidate questions — each a structurally different way it could anchor an inquiry thread the user holds over several sessions. Not summaries or descriptions: live questions, in the user's own voice.

Take genuinely different angles: normative vs. descriptive vs. conceptual; close reading vs. wide frame; what it shows vs. what it does vs. what it leaves out. If the user added a note, one candidate can follow it; the others should offer framings they might not have considered.

Output ONLY valid JSON:
{
  "observation": "2-3 sentences naming what's salient — specific and concrete",
  "candidates": [
    {"angle": "2-4 words naming the angle", "question": "the question, as the user might hold it"}
  ]
}`;

export const SLOT_MEANING_EXPLORE = {
  sharpen: 'an item that CUTS CLOSER to the territory they want to see — a vivid, exemplary instance of what they named',
  complicate: 'an item that introduces a CASE THAT RESISTS the directive — something within the territory that pushes against their framing',
  bridge: "an item that points to ADJACENT TERRITORY they didn't name — a related domain where the same shape shows up in different terms",
  ground: 'a CONCRETE INSTANCE — a specific example, person, place, work, or community that embodies the directive',
};

export const SLOT_DESCRIPTIONS = {
  sharpen: 'an item that SHARPENS — cuts closer to the heart of what the user is actually asking, makes the existing framing more precise. Match the register: a playful question gets a vivid, well-made piece that hits the same target more sharply, not a philosophy paper.',
  complicate: "an item that COMPLICATES — introduces genuine tension, a case the current framing doesn't handle, a perspective that resists the thread's presuppositions. Should still feel inviting, not academic.",
  bridge: 'an item that BRIDGES to a distant domain — something structurally analogous from a different field (biology, architecture, music, sport, crafts, design, ecology) where the same shape of question has been worked through in different terms. Vivid and surprising, not dutifully cross-disciplinary.',
  ground: "an item that GROUNDS — a concrete case, a specific person's account, a primary source, a video walkthrough, a discussion among practitioners — something that puts the abstract question into a specific material situation.",
};

// Short slot labels for the UI.
export const SLOT_BLURB = {
  sharpen: 'cuts closer',
  complicate: 'pushes back',
  bridge: 'same shape, elsewhere',
  ground: 'a concrete case',
};

// ---- the shared context block ---------------------------------------------
// ctx: { question, reading, corrections, history, kept, artifact, seed, lineage }
export function contextBlock(ctx, { includeReading = true } = {}) {
  const lines = [];
  const r = ctx.reading;
  if (includeReading && r) {
    lines.push('Structural reading of the thread:');
    lines.push(`- Domain: ${r.domain || '—'}`);
    lines.push(`- Type: ${r.questionType || '—'}`);
    lines.push(`- Register: ${r.register || 'curious'} · Mode: ${r.mode || 'question'}`);
    if (r.presuppositions?.length) lines.push(`- Presuppositions: ${r.presuppositions.join('; ')}`);
    if (r.absent?.length) lines.push(`- Conspicuously absent: ${r.absent.join('; ')}`);
    if (r.openingMove) lines.push(`- Opening move: ${r.openingMove}`);
  }
  const c = ctx.corrections;
  if (c && (c.rejected?.length || c.added?.length || c.note)) {
    lines.push('The user CORRECTED the reading (authoritative):');
    if (c.rejected?.length) lines.push(`- Not true of their question: ${c.rejected.map((x) => `"${x}"`).join('; ')}`);
    if (c.added?.length) lines.push(`- They added: ${c.added.map((x) => `"${x}"`).join('; ')}`);
    if (c.note) lines.push(`- In their words: "${clip(c.note, 300)}"`);
  }
  if (ctx.artifact?.observation) lines.push(`The thread started from an image: ${clip(ctx.artifact.observation, 300)}`);
  if (ctx.seed) lines.push(`The thread started from an item the user held: "${ctx.seed.title}" (${ctx.seed.source || 'unknown source'})${ctx.seed.why ? ` — ${clip(ctx.seed.why, 200)}` : ''}`);
  if (ctx.lineage) lines.push(`It branched from an earlier thread ("${clip(ctx.lineage.fromQuestion, 140)}")${ctx.lineage.anchorTitle ? `, anchored on "${ctx.lineage.anchorTitle}"` : ''}.`);
  if (ctx.kept?.length) {
    lines.push('Items the user KEPT on this thread (what they found worth holding onto):');
    for (const k of ctx.kept.slice(0, 8)) lines.push(`- "${clip(k.title, 100)}" (${k.slot})${k.note ? ` — their note: "${clip(k.note, 160)}"` : ''}`);
  }
  if (ctx.history) lines.push(`Observed effect history on this thread (favor what moved; avoid what closed the question down):\n${ctx.history}`);
  return lines.join('\n');
}

export function characterizePrompt(ctx) {
  const prior = ctx.reading ? `\n\nYour previous reading of this thread:\n${contextBlock({ reading: ctx.reading })}` : '';
  const rest = contextBlock({ ...ctx, reading: null });
  return `The thread, as the user holds it now:\n"${ctx.question}"${prior}${rest ? `\n\n${rest}` : ''}\n\nRead it afresh.`;
}

const slotContext = (slot, ctx) => {
  const isExplore = ctx.reading?.mode === 'explore';
  return `${isExplore ? `Directive (the user wants to be shown things): "${ctx.question}"` : `Question the user is holding: "${ctx.question}"`}
Meet the register; offer a slightly steeper path than they'd choose alone.
The ${slot.toUpperCase()} slot's job: ${isExplore ? SLOT_MEANING_EXPLORE[slot] : SLOT_DESCRIPTIONS[slot]}

${contextBlock(ctx)}${tasteBlock(ctx.taste)}`;
};

// The user's own 0–4 ratings (informative, artistic, profound, ethical,
// entertaining; "provoking" = mindless 0 ↔ thought-provoking 4), across all threads.
export function tasteBlock(taste) {
  if (!taste) return '';
  const lines = [`\nThe user's own quality ratings of items they've read (0–4; "provoking" runs mindless→thought-provoking), across ${taste.count} rated item${taste.count === 1 ? '' : 's'}. Average by axis: ${taste.axes}.`];
  if (taste.high.length) lines.push(`Rated HIGH — favor items with these qualities:\n${taste.high.map((x) => '- ' + x).join('\n')}`);
  if (taste.low.length) lines.push(`Rated LOW — avoid items like these:\n${taste.low.map((x) => '- ' + x).join('\n')}`);
  lines.push("Use this as a quality preference within the slot's job — never let it override what the slot is for or the thread's register.");
  return '\n' + lines.join('\n');
}

// What each slot SEARCHES for. The four slots fill in parallel and never see
// each other, so each one gets a different kind of source; that is what keeps
// the feed from landing on the same famous person twice.
const SLOT_SEARCH_LANE = {
  sharpen: 'the single best work that meets the question head-on: an essay, talk, lecture or explainer by a named expert or by the person most associated with the idea.',
  complicate: 'a work that argues AGAINST the framing: a critic, a rival school, a counter-example, or evidence that cuts against one of the presuppositions in the reading. Search for the counter-position itself (name it), not for the topic. Do not search for the person or school most famously tied to the question; that is the sharpen slot.',
  bridge: 'a work from a DIFFERENT field where the same structure shows up. First decide which field (name it in the query), then search for a specific work in that field. Leave out the question\'s own topic words; a bridge query that contains the question\'s main nouns stays in the same domain. Choose the field where the structure is genuinely closest, not the most familiar go-to analogy.',
  ground: 'one specific person, place or case: a first-person account, a case study, a primary source, a demonstration, or practitioners talking it through. Not an overview and not the famous theorist; someone living the question in a concrete situation.',
};

const SLOT_SEARCH_LANE_EXPLORE = {
  sharpen: 'the most vivid, exemplary instance of what they named, by a named maker, critic or channel.',
  complicate: 'a case inside the territory that resists or troubles the directive (a failure, a critique, a contested example).',
  bridge: 'the same shape in a different field: name that field in the query and leave out the directive\'s own topic words.',
  ground: 'one specific named instance (a person, place, work or community) shown up close, e.g. a visit, a walkthrough, a maker at work.',
};

// How to handle questions that are not well-formed search material. General
// rules, keyed to the shape of the question, not to any one topic.
const QUERY_SHAPE_RULES = `If the question is:
- OVER-BROAD (a whole field, or all of life, in one question): do not search the whole question. Pick ONE concrete angle (a presupposition or an absent thing from the reading) that suits this slot, and search for a work on that angle.
- VAGUE or a single word: choose the most promising concrete reading of it and search for a work on that.
- HYPER-SPECIFIC (a particular object, model, date or setup): a work on the exact case may not exist. Widen ONE level, to the mechanism or general case that explains it (the chemistry, the physics, the general phenomenon), and keep the key technical term.
- BUILT ON A FALSE OR SHAKY PREMISE (a myth, a debunked claim): search for the correction, i.e. the historian, scientist or careful work that examines the claim and where it came from. Do not search the premise as if it were true.
- NEAR-NONSENSE (words that do not form a real question): search for the nearest real thing it could point to (a playful idea, an absurdist work, a concept about categories or language). Do not pretend it is a real field.`;

const REGISTER_RULES = `Register:
- grieving: personal essays, memoir, gentle talks, writing for ordinary readers by people who work with grief. Never a clinical study or methods paper. Complicate and bridge stay gentle: another way of seeing, not an argument against the user's feelings.
- urgent: something the user can use now, from a credible named source (a clinician, an experienced practitioner, a respected organisation). Calm, not alarmist; no clickbait.
- playful: lively, well-made pieces that still have substance, not dissertations.
- practical: a demonstration or a practitioner's account beats a theory piece.`;

const laneFor = (slot, ctx) => (ctx.reading?.mode === 'explore' ? SLOT_SEARCH_LANE_EXPLORE : SLOT_SEARCH_LANE)[slot];

const avoidBlock = (avoid = []) => (avoid.length
  ? `\nOther slots in this feed already use these, so do NOT search for the same person, channel, work or site: ${avoid.slice(0, 8).map((a) => `"${clip(a, 80)}"`).join('; ')}`
  : '');

export const searchQueryPrompt = (slot, ctx, excludeUrls = [], { avoid = [], retry = null } = {}) => `You are writing ONE web-search query to fill a slot in the feed of Mosaic, an inquiry tool.

${slotContext(slot, ctx)}

What the ${slot.toUpperCase()} query should look for: ${laneFor(slot, ctx)}

How to write it:
- If you know a specific, well-regarded work that fits (a book chapter, essay, talk, paper, film, documentary), search for it by its title and its author or maker. Otherwise describe the work you want: subject + a form word (essay, talk, lecture, interview, case study, documentary, memoir, forum thread).
- 4 to 12 plain words. ONE idea per query: no OR, no site:, no lists of several names or alternatives (long, stuffed queries make the search engine return unrelated filler). Use quotation marks only around an exact title. No years unless the question is about a date. No filler words such as "analysis", "personal anecdote", "insights".
- Add "video" or "youtube" only when a video is clearly the best form for THIS slot (a demonstration, a performance, a walkthrough, a talk). Do not add it by default.
- The query must not ask for a list ("best", "top", "examples of", "tips").

${QUERY_SHAPE_RULES}

${REGISTER_RULES}${avoidBlock(avoid)}${retry ? `

A first search for this slot did not work.
First query: "${retry.query}"
It returned: ${retry.seen.slice(0, 7).map((s) => `"${clip(s, 70)}"`).join('; ')}
Why none fit: ${clip(retry.reason, 240)}
Write a DIFFERENT query that fixes that problem: a different angle or a named work, not a rewording.` : ''}${excludeUrls.length ? '\nAlready used (find something else): ' + excludeUrls.slice(-20).join(', ') : ''}

Output ONLY valid JSON: {"query": "the search query"}`;

export const selectFromResultsPrompt = (slot, ctx, results, { avoid = [], allowNone = true } = {}) => `You are filling one slot in the feed of Mosaic, an inquiry tool, by choosing from REAL web search results.

${slotContext(slot, ctx)}

The candidates (real results — these URLs exist):
${results.map((r, i) => `${i + 1}. ${r.title}\n   url: ${r.url}\n   ${r.snippet}`).join('\n')}

Choose the ONE candidate that best fills the ${slot.toUpperCase()} slot. Judge by the slot's job and the register, not by which looks most authoritative.
- It must be a real work by an identifiable source: a specific essay, talk, video, paper, interview, chapter, or a substantial discussion. Prefer a primary source or a named expert over a summary of them.
- Reject listicles ("7 ways...", "5 fixes..."), SEO or content-farm pages, product and shop pages, course-sales pages, news-aggregator stubs, social-media reposts, and pages that only restate the question.
- It must do THIS slot's job: a complicate that agrees with the user is a miss; a bridge from the same field as the question is a miss; a ground must be a concrete case.
- Fit the register (see the reading): grief is not met with a methods paper; a playful question is not met with a dissertation.${avoid.length ? `\n- Other slots already use these; do not pick the same person, channel, work or site: ${avoid.slice(0, 8).map((a) => `"${clip(a, 80)}"`).join('; ')}` : ''}

${allowNone
    ? `If NO candidate passes these tests, do not force one. Output instead: {"none": true, "reason": "one sentence: what was wrong with the candidates"}. Use this only when every candidate fails; a real, relevant work with an imperfect fit is still a pick.`
    : 'You MUST choose exactly one. If no candidate is ideal, pick the least-imperfect one and let "why" say plainly what it offers and where it falls short.'}

CRITICAL: "url" MUST be copied character-for-character from the chosen candidate. Never modify, shorten, or invent a URL.

Output ONLY valid JSON:
{
  "title": "the item's actual title (clean up encoding/truncation if needed)",
  "source": "author, publication, channel, or speaker",
  "url": "the chosen candidate's url, verbatim",
  "mediaType": "what the link opens, one of: ${MEDIA_TYPES.join(', ')}",
  "preview": "2-3 sentences giving a vivid sense of what's in the item — match the register",
  "why": "2-3 sentences: why this item, in this slot, for this thread — honest about imperfect fit",
${TAG_FIELDS_SPEC}
}${vocabHint(ctx.vocab)}`;

// Last-resort tier: the model proposes a well-known item whose URL must be an
// English Wikipedia article (enforced in code — see feed.js).
export const knowledgePrompt = (slot, ctx, excludeUrls = [], retry = false) => `You are filling one slot in the feed of Mosaic, an inquiry tool, from your own knowledge.

${slotContext(slot, ctx)}

${retry ? 'Your previous suggestion was rejected. Propose a DIFFERENT item.' : ''}
Propose ONE real, well-known, substantial item that fits this slot — a book, essay, film, talk, or documented case. "url" MUST be its English Wikipedia article: https://en.wikipedia.org/wiki/<Article_Title>. Nothing else is acceptable. ${excludeUrls.length ? 'Already used: ' + excludeUrls.slice(-20).join(', ') : ''}

Output ONLY valid JSON:
{
  "title": "", "source": "", "url": "https://en.wikipedia.org/wiki/…", "preview": "2-3 sentences", "why": "2-3 sentences: why this item, in this slot, for this thread",
${TAG_FIELDS_SPEC}
}${vocabHint(ctx.vocab)}`;

// Tag items after the fact (records made before items carried a field and
// topics). items: [{title, source, url, mediaType, preview}] → [{i, field, topics, mediaType}]
export const tagItemsPrompt = (items, vocab = []) => `Tag each item below for a personal reading record. For each: the ONE broad field it belongs to, 2-4 short topic tags, and what the link opens.

${items.map((it, i) => `${i + 1}. "${clip(it.title, 120)}"${it.source ? ` — ${clip(it.source, 60)}` : ''}\n   ${it.url || ''}\n   ${clip(it.preview, 220)}`).join('\n')}

Rules:
- "field" is exactly one of: ${FIELDS_LIST}
- "topics": 2-4 short lowercase subject tags, general enough to recur across different items ('attention', 'game theory', 'grief'). Tag what the item is ABOUT, not its format.
- "mediaType" is one of: ${MEDIA_TYPES.join(', ')}${vocabHint(vocab)}

Output ONLY valid JSON: {"tags": [{"i": 1, "field": "", "topics": [""], "mediaType": ""}, ...]} — one entry per item, same numbering.`;

export const diffPrompt = ({ before, after, moved = [], closed = [], note = '', kept = [] }) => `A user is holding a question on Mosaic. At the start of this session they put it as:

BEFORE: "${before}"

During the session they marked these items as having moved them — ${moved.join('; ') || 'none'}${closed.length ? ` — and these as having closed the question down — ${closed.join('; ')}` : ''}.${kept.length ? ` They kept: ${kept.join('; ')}.` : ''}
Then they restated it as:

AFTER: "${after}"
${note ? `\nTheir note on the session: "${note}"\n` : ''}
Produce the articulation-diff: name what actually moved between BEFORE and AFTER. Match the register of the user's own writing — honest mirror, not a philosophy paper.

The verdict, for the diff as a whole: "real" = a new distinction introduced, a presupposition abandoned, scope structurally widened or narrowed, the locus of explanation shifted. "cosmetic" = rewording without structural change — synonyms swapped, phrasing polished, same frame. This binary guards against rewarding verbal restlessness. A cosmetic verdict is not a failure; it's data.

Output ONLY valid JSON:
{
  "verdict": "real" | "cosmetic",
  "verdictWhy": "one sentence justifying the verdict, grounded in the two articulations",
  "moves": [
    {"label": "short name — e.g. 'Presupposition abandoned', 'Scope narrowed', 'Binary dissolved', 'Got more specific'", "content": "1-2 sentences naming specifically what moved, quoting the two articulations where it helps"}
  ]
}

Produce 2-4 moves (1 is enough when the verdict is cosmetic).`;
