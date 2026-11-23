// The views page (/views): a standalone, public demo of mapping a question's
// views by the specific points they disagree on. One shape serves both the
// ready-made examples (src/viewsdemo/examples.js, researched and link-checked
// by hand) and a typed question mapped live (server/viewsDemo.js):
//
//   { status: 'mapped' | 'none',
//     question, headline,                                  headline names the views, never a verdict
//     views:    [{ id, name, short, summary, who, changeMind,
//                  reasons: [{ text, sources: [SOURCE] }],  the view's own reasons, each with where it's argued
//                  sources: [SOURCE] }]                     more reading from people who hold it
//     cruxes:   [{ question, left, right, why, positions: { [viewId]: 'left'|'right'|'mid' } }]
//     wording:  { assumes, leansAwayFrom: [viewId] }     what the question takes for granted
//     nearby:   [string]                                 questions that ARE argued, for 'none'
//   }
//   SOURCE = { title, outlet, author, date, url, quote }
//
// The page never rules on a question. Every question, a scientific one
// included, is shown as the views on it, each with its reasons and sources,
// and who holds it, so the reader judges for themselves.
// Pure (prompts, validation, arithmetic); no I/O here.

export const POSITIONS = ['left', 'right', 'mid'];
export const MAX_VIEWS = 4, MAX_CRUXES = 4, MAX_REASONS = 3;

// ---- prompts for a typed question ------------------------------------------------
export const MAP_SYSTEM = `You map the main views people hold on a question, for a reader who knows nothing about the topic. You never answer the question yourself and never say which view is right: you show the views, what each one argues, who holds it, and the specific points they split on, so the reader can judge.

Rules:
- VIEWS: 3 or 4 positions that real organisations and people hold today. Cover the range, from the mainstream position of major institutions to the strongest dissenting ones; on a scientific question, the view of the major scientific or health bodies is one view, described as theirs. Name each view in 2-4 everyday words by its position ("Keep every routine shot", "Build much more nuclear"), never by party or tribe. "short" is a 1-2 word tag. The summary is one sentence, fair, as its own holders would put it. "who" names the organisations and people who hold it, plainly, so the reader can see how widely it is held. Name only holders you are sure of, with their real titles and countries; fewer and right beats more and wrong.
- NEUTRAL VOICE: describe each view in its holders' terms. No "rightly", "wrongly", "misinformation", "debunked", "the evidence shows" or any ruling in your own voice. The headline is one sentence that names the views and the point they split on most (e.g. "Four main views, from full bans to cleaner cars; they split most on whether bans hurt local shops."), never a restatement of the question and never an answer.
- CRUXES: 3 or 4 specific, concrete questions the views answer differently (what would happen, what caused it, which evidence holds up, which good gives way). Never "do you care about X". Each is a short plain question a 12-year-old can read, with a left and a right answer of 2-5 words. Every crux must split the views: at least one view left and one right. A view may sit "mid" (in between, or it depends).
- WORDING: if the question's wording takes something for granted, say what in one neutral sentence, and list the views that reject it. Otherwise null and [].
- SEARCH: for each view, a web search (5-10 words) likely to find an op-ed, essay, report or position statement written by someone who HOLDS it.
- STATUS: "mapped" for any question people hold different public views on, including scientific and health questions. "none" only for a personal, practical or trivia question with no public sides (then give "nearby": 2-3 questions close to it that people do hold different views on, if any).

Output ONLY valid JSON:
{"status":"mapped|none","headline":"one plain sentence","views":[{"id":"kebab-id","name":"2-4 words","short":"1-2 words","summary":"...","who":"named organisations or people who hold it","changeMind":"the specific evidence or event that would move this view","search":"..."}],"cruxes":[{"question":"...","left":"...","right":"...","why":"one plain sentence","positions":{"<view id>":"left|right|mid"}}],"wording":{"assumes":null,"leansAwayFrom":[]},"nearby":[]}
Be concise.`;

export const mapPrompt = (question) => `The question: "${String(question).trim()}"`;

export const PICK_SYSTEM = `You match views to real web pages found by search. You get numbered groups, one per VIEW. For each, pick up to 2 results written by someone who HOLDS and ARGUES that view: an op-ed, essay, advocacy page, position statement, report or paper making its case. Never a neutral explainer, never a piece arguing another side, and never a business listing, map, directory, shop or profile page. If nothing qualifies, pick none. Never invent a result. For each pick give: the outlet or organisation; "reason", one plain sentence (at most 30 words) stating the argument itself as its holder makes it (e.g. "Car-free streets cut asthma cases in children, says the city's health board."), never "The page states…" or "The article argues…", using only what the result text says and never as your own ruling; and "quote", at most 20 words copied exactly from the result text that shows it.

Output ONLY valid JSON: {"picks":[{"group":1,"result":3,"outlet":"...","reason":"...","quote":"..."}]}`;

export function pickPrompt(groups) {
  return groups.map((g, i) => {
    const lines = (g.results || []).map((r, j) => `  ${j + 1}. ${r.title} (${hostOf(r.url)}): ${String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 320)}`);
    return `Group ${i + 1} — VIEW: ${g.label}\n${lines.length ? lines.join('\n') : '  (no results)'}`;
  }).join('\n\n');
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const str = (v, n = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const kebab = (s, i) => (str(s, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `view-${i + 1}`);

export function cleanSource(s) {
  if (!s || typeof s !== 'object') return null;
  let url;
  try { url = new URL(String(s.url)); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  return {
    title: str(s.title, 200), outlet: str(s.outlet, 80) || hostOf(url.href), author: str(s.author, 80),
    date: str(s.date, 10), url: url.href, quote: str(s.quote, 200),
  };
}

// Model output (or a hand-made example) → the clean shape. Views get unique
// ids; cruxes that don't split the views are dropped (they'd be values in
// disguise); a view left with the same positions as another is dropped.
const cleanSources = (a, n) => (Array.isArray(a) ? a : []).map(cleanSource).filter(Boolean).slice(0, n);

export function normalizeMap(raw, { question = '' } = {}) {
  const status = raw?.status === 'none' ? 'none' : 'mapped';
  const ids = new Set();
  let views = (Array.isArray(raw?.views) ? raw.views : []).slice(0, MAX_VIEWS).map((v, i) => {
    let id = kebab(v?.id || v?.name, i);
    while (ids.has(id)) id += '-x';
    ids.add(id);
    return {
      id, name: str(v?.name, 48), short: str(v?.short, 24) || str(v?.name, 24), summary: str(v?.summary, 280),
      who: str(v?.who, 320), changeMind: str(v?.changeMind, 280), search: str(v?.search, 120),
      reasons: (Array.isArray(v?.reasons) ? v.reasons : []).map((r) => ({ text: str(r?.text, 280), sources: cleanSources(r?.sources, 2) }))
        .filter((r) => r.text).slice(0, MAX_REASONS),
      sources: cleanSources(v?.sources, 3),
      _raw: v?.id || '',
    };
  }).filter((v) => v.name);
  // Positions may be keyed by the given id or by the name.
  const idOf = (k) => {
    const s = String(k);
    return views.find((v) => v.id === s || v._raw === s || v.name === s || v.id === kebab(s, -1))?.id;
  };

  let cruxes = (Array.isArray(raw?.cruxes) ? raw.cruxes : []).slice(0, MAX_CRUXES + 2).map((c) => {
    const positions = {};
    for (const [k, p] of Object.entries(c?.positions || {})) {
      const id = idOf(k);
      if (id) positions[id] = POSITIONS.includes(String(p).toLowerCase()) ? String(p).toLowerCase() : 'mid';
    }
    for (const v of views) if (!positions[v.id]) positions[v.id] = 'mid';
    return { question: str(c?.question, 160), left: str(c?.left, 60), right: str(c?.right, 60), why: str(c?.why, 240), positions };
  }).filter((c) => c.question && c.left && c.right);

  const splits = (c) => views.some((v) => c.positions[v.id] === 'left') && views.some((v) => c.positions[v.id] === 'right');
  cruxes = cruxes.filter(splits).slice(0, MAX_CRUXES);
  const seen = new Set();
  views = views.filter((v) => {
    const k = cruxes.map((c) => c.positions[v.id]).join('|');
    if (cruxes.length && seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(({ _raw, ...v }) => v);

  const keepIds = new Set(views.map((v) => v.id));
  const away = (Array.isArray(raw?.wording?.leansAwayFrom) ? raw.wording.leansAwayFrom : []).map(idOf).filter((id) => id && keepIds.has(id));
  const assumes = raw?.wording?.assumes ? str(raw.wording.assumes, 240) : null;

  const finalStatus = status === 'mapped' && views.length >= 2 && cruxes.length >= 1 ? 'mapped' : 'none';
  return {
    status: finalStatus,
    question: str(raw?.question || question, 300),
    headline: str(raw?.headline, 300),
    views: finalStatus === 'mapped' ? views : [],
    cruxes: finalStatus === 'mapped' ? cruxes : [],
    wording: { assumes, leansAwayFrom: assumes ? away : [] },
    nearby: (Array.isArray(raw?.nearby) ? raw.nearby : []).map((q) => str(q, 140)).filter(Boolean).slice(0, 3),
  };
}

// ---- arithmetic for the page -----------------------------------------------------
// How many of the disagreement questions two views answer alike ('mid' with
// 'mid' counts; 'mid' against a side doesn't).
export function sameCount(map, a, b) {
  return map.cruxes.reduce((n, c) => n + (c.positions[a] === c.positions[b] ? 1 : 0), 0);
}

// The view each view is closest to.
export function closestTo(map, id) {
  let best = null;
  for (const v of map.views) {
    if (v.id === id) continue;
    const n = sameCount(map, id, v.id);
    if (!best || n > best.same) best = { id: v.id, name: v.name, same: n };
  }
  return best;
}

// Every source a view stands on: those behind its reasons, then further reading.
export const viewSources = (v) => [...(v.reasons || []).flatMap((r) => r.sources), ...(v.sources || [])];

// Distinct pages linked on the whole map.
export const SOURCE_COUNT = (map) => new Set(map.views.flatMap((v) => viewSources(v).map((s) => s.url))).size;
