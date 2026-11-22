// The views mandala (admin only for now): for a question that is genuinely
// contested, map the views by their CRUXES, not by the values they claim.
// Everyone says they care about fairness, safety or civilians; what separates
// views is the specific factual, causal, evidential or trade-off claims they
// answer differently. Each view is a pattern of answers to those cruxes, so
// overlaps fall out of the answers themselves.
//
// Pure: prompts, validation and the arithmetic on a map. The server
// (server/views.js) makes the model and search calls; the UI
// (src/ui/views/) draws it. Settled facts are kept OUT of the views, so a
// consensus never gets presented as one side of a debate.

export const ANSWERS = ['a', 'b', 'mid'];
export const CRUX_KINDS = ['cause', 'effect', 'evidence', 'trade-off', 'fact'];
export const MIN_VIEWS = 3, MAX_VIEWS = 5, MIN_CRUXES = 3, MAX_CRUXES = 5;

export const VIEWS_SYSTEM = `You are the views component of Mosaic, an inquiry tool where people hold a question over weeks. Given a question, you decide whether it is genuinely contested, and if it is, you map the views on it BY THEIR CRUXES.

STATUS — pick exactly one:
- "divisive": informed, reasonable people currently and substantially disagree about it, in public (policy, politics, war, morality, contested causes or effects). Real constituencies hold the different views.
- "settled": the core of it has an established answer from the evidence or the record (scientific consensus, documented history), even if some people deny it. Do NOT map denial as a "view": that would be false balance.
- "not": a personal, practical, aesthetic, technical or curiosity question with no real public sides.

WHY CRUXES, NOT VALUES: every side claims the same values (fairness, safety, freedom, caring about civilians or children). Stated values barely separate anyone. A crux is a SPECIFIC claim where the views would answer differently:
- cause: what caused it, who started or escalated it
- effect: what would actually happen if a policy or action were taken
- evidence: which data, studies or sources are trustworthy
- trade-off: when two goods collide, which gives way
- fact: a factual question that is genuinely open (not settled)
Each crux must be a question with two clear answers, "a" and "b", short enough to read on a phone. A view may also sit "mid" (in between, or it depends). EVERY crux must split the views: at least one view answers "a" and at least one answers "b". Never use a crux like "do you care about X".

VIEWS: 3 to 5 views that real people and organisations hold today. Name each by its position in plain words ("Ban accounts under 16", "Teach, don't ban"), never by a tribe or party label. Make them genuinely distinct: no two views with the same answers to every crux. Describe each the way its own holders would, fairly, without strawmen.

THE QUESTION'S LEAN: the user's wording often already assumes an answer to some cruxes. For each crux say which answer the wording assumes ("a" or "b"), or null when it assumes neither. Be honest: most neutral questions assume little.

Output ONLY valid JSON, no prose. Schema:
{
  "status": "divisive | settled | not",
  "why": "one sentence: why it is (or isn't) contested",
  "topic": "2-5 words naming the dispute",
  "settled": ["0-3 short facts the views all accept, kept out of the map"],
  "cruxes": [
    {"kind": "cause | effect | evidence | trade-off | fact", "label": "1-3 words", "question": "the crux as a short question", "a": "first answer, 2-6 words", "b": "second answer, 2-6 words"}
  ],
  "views": [
    {"name": "2-5 words", "summary": "one sentence, as its holders would put it", "answers": ["a | b | mid, one per crux, in order"], "changeMind": "the specific evidence or event that would move this view", "search": "a web search to find an argument written by someone who holds this view (an op-ed, essay, report or paper making the case), 4-10 words"}
  ],
  "lean": ["a | b | null, one per crux, in order"],
  "leanWhy": "one sentence on what the wording assumes, or empty"
}
For "settled" or "not", give only status, why and topic, and leave cruxes and views empty.`;

export function viewsPrompt({ question, presuppositions = [], force = false }) {
  const pre = presuppositions.length ? `\nWhat a reading found the question takes for granted: ${presuppositions.slice(0, 4).join('; ')}` : '';
  const ask = force
    ? 'The user asked to see the views. If there are real public disagreements anywhere near this question, map them (status "divisive"), even if the question itself is phrased personally. Only answer "settled" when the core is settled, and "not" when there truly are no sides.'
    : 'Decide the status. Map it only if it is clearly divisive.';
  return `The question: "${String(question).trim()}"${pre}\n\n${ask}`;
}

export const PICK_SYSTEM = `You are matching views on a contested question to real pieces found by web search. For each view you get numbered search results. Pick the ONE result that was written by someone who HOLDS that view and argues for it (an op-ed, essay, advocacy report, paper or talk making the case). Not a neutral news report, not an explainer, not a piece arguing a different view. If none qualifies, pick null. Never invent a result.

Output ONLY valid JSON: {"picks": [{"view": 1, "result": 3, "by": "author or organisation if the result shows it, else empty"}]}`;

export function pickPrompt(views, resultsByView) {
  const blocks = views.map((v, i) => {
    const rs = resultsByView[i] || [];
    const lines = rs.map((r, j) => `  ${j + 1}. ${r.title} (${hostOf(r.url)}): ${String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 260)}`);
    return `View ${i + 1}: "${v.name}" — ${v.summary}\n${lines.length ? lines.join('\n') : '  (no results)'}`;
  });
  return blocks.join('\n\n');
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const str = (v, n = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const answer = (v) => { const s = String(v ?? '').trim().toLowerCase(); return ANSWERS.includes(s) ? s : 'mid'; };

// Model output → a clean map, or a non-divisive verdict. Cruxes that don't
// split the views are dropped (they'd be values in disguise), and so are
// views left identical to another. Too little left → treated as not mapped.
export function normalizeViews(raw) {
  const status = ['divisive', 'settled', 'not'].includes(raw?.status) ? raw.status : 'not';
  const base = { status, why: str(raw?.why, 300), topic: str(raw?.topic, 60) };
  if (status !== 'divisive') return base;

  let cruxes = (Array.isArray(raw.cruxes) ? raw.cruxes : []).slice(0, MAX_CRUXES).map((c) => ({
    kind: CRUX_KINDS.includes(String(c?.kind).toLowerCase()) ? String(c.kind).toLowerCase() : 'fact',
    label: str(c?.label, 32), question: str(c?.question, 160), a: str(c?.a, 60), b: str(c?.b, 60),
  }));
  let views = (Array.isArray(raw.views) ? raw.views : []).slice(0, MAX_VIEWS).map((v) => ({
    name: str(v?.name, 48), summary: str(v?.summary, 260),
    answers: cruxes.map((_, i) => answer(v?.answers?.[i])),
    changeMind: str(v?.changeMind, 260), search: str(v?.search, 120),
  })).filter((v) => v.name);
  let lean = cruxes.map((_, i) => { const l = String(raw.lean?.[i] ?? '').toLowerCase(); return l === 'a' || l === 'b' ? l : null; });

  // Keep only cruxes the views actually split on.
  const keep = cruxes.map((c, i) => c.question && c.a && c.b && views.some((v) => v.answers[i] === 'a') && views.some((v) => v.answers[i] === 'b'));
  cruxes = cruxes.filter((_, i) => keep[i]);
  lean = lean.filter((_, i) => keep[i]);
  views = views.map((v) => ({ ...v, answers: v.answers.filter((_, i) => keep[i]) }));
  // Drop a view whose answers repeat an earlier one exactly.
  const seen = new Set();
  views = views.filter((v) => { const k = v.answers.join(''); if (seen.has(k)) return false; seen.add(k); return true; });

  if (cruxes.length < MIN_CRUXES - 1 || views.length < MIN_VIEWS) {
    return { ...base, status: 'not', why: base.why || 'The views did not separate on specific claims.' };
  }
  const settled = (Array.isArray(raw.settled) ? raw.settled : []).map((s) => str(s, 160)).filter(Boolean).slice(0, 3);
  return { ...base, settled, cruxes, views, lean, leanWhy: str(raw.leanWhy, 260) };
}

// ---- arithmetic on a map ----------------------------------------------------------
// Shared answers between two views: 'mid' counts as half a match with anything.
export function agreement(x, y) {
  let n = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) n += x[i] === 'mid' ? 0.5 : 1;
    else if (x[i] === 'mid' || y[i] === 'mid') n += 0.25;
  }
  return n;
}
export const sameCount = (x, y) => x.reduce((n, a, i) => n + (a === y[i] ? 1 : 0), 0);

// The view each view is closest to, and on how many cruxes they answer alike.
export function closestOf(map, i) {
  const me = map.views[i];
  let best = null;
  map.views.forEach((v, j) => {
    if (j === i) return;
    const score = agreement(me.answers, v.answers);
    if (!best || score > best.score) best = { index: j, score, same: sameCount(me.answers, v.answers) };
  });
  return best;
}

// How the question's wording sits against a view: on the cruxes the wording
// assumes something about, how many this view answers the other way.
// → { assumed, against, away } — away: the view mostly rejects what the question assumes.
export function leanAgainst(map, i) {
  const ans = map.views[i].answers;
  let assumed = 0, against = 0;
  (map.lean || []).forEach((l, k) => {
    if (!l) return;
    assumed++;
    if (ans[k] !== l && ans[k] !== 'mid') against++;
  });
  return { assumed, against, away: assumed > 0 && against * 2 >= assumed && against > 0 };
}
