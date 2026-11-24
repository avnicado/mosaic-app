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
- VIEWS: 3 or 4 positions that real organisations and people hold today. Cover the range, from the mainstream position of major institutions to the strongest dissenting ones; on a scientific question, the view of the major scientific or health bodies is one view, described as theirs. Name each view in 2-4 everyday words by its position ("Keep every routine shot", "Build much more nuclear"), never by party or tribe. "short" is a 1-2 word tag. The summary is one sentence, fair, as its own holders would put it. "who" names the organisations and people who hold it, plainly, so the reader can see how widely it is held. Name only holders you are sure of, with their real titles; fewer and right beats more and wrong.
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

Each result carries the date it was published, or "date unknown". A page written before the events the question is about cannot argue a view about them; where the question is about something still going on, prefer the most recent.

Output ONLY valid JSON: {"picks":[{"group":1,"result":3,"outlet":"...","reason":"...","quote":"..."}]}`;

export const RING_PICK_SYSTEM = `You match questions to real web pages found by search. You get numbered groups, one per QUESTION, each with two opposite answers, A and B. For each group, pick up to 2 results that argue answer A and up to 2 that argue answer B, on that question itself: an op-ed, essay, position statement, report, paper, or news analysis that makes that case. Never a page that only mentions the topic, never a business listing, map, directory, shop or profile page. If nothing qualifies for a side, pick none for it. Never invent a result. For each pick give: "side" ("A" or "B"); the outlet or organisation; "says", one plain sentence (at most 30 words) stating the argument the page makes on this question as its author makes it, never "The page states…", using only what the result text says and never as your own ruling; "quote", at most 20 words copied exactly from the result text that shows it; and "title_side", which answer the page's TITLE alone argues ("A", "B", or "neither").

Each result carries the date it was published, or "date unknown". The date is part of the judgement, not a detail. A page written before the events the question is about cannot argue about them: a 1997 transcript cannot argue about a war in 2022, and a study of one war cannot argue about a later one. Where the question is about something still going on, prefer the most recent pages, and never pick one that is clearly out of date on it. Where the question is a standing one (a scientific mechanism, a principle, a language's design), an older page is fine. If the date is unknown and the question turns on the period, pick none.

Judge a page by what it argues as a whole, starting from its title, never by one sentence of the snippet. A snippet often states the view the page goes on to reject ("Russia saw NATO enlargement as a threat" in a piece titled "NATO enlargement is not to blame"); such a page argues the OTHER answer. Never place a page under an answer its title argues against.

Output ONLY valid JSON: {"picks":[{"group":1,"result":3,"side":"A","outlet":"...","says":"...","quote":"...","title_side":"A"}]}`;

export function ringPickPrompt(groups) {
  return groups.map((g, i) => {
    const lines = (g.results || []).map((r, j) => `  ${j + 1}. ${r.title} (${hostOf(r.url)}${dateOf(r) ? `, ${dateOf(r)}` : ', date unknown'}): ${String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 320)}`);
    // "About" names the question the whole map is on, so a page about a
    // different war, policy or decade can be refused. Without it the model
    // placed pieces on Operation Cast Lead (2008) under a ring of the 2023
    // invasion of Gaza. See docs/views-review-2026-11-24.md.
    const about = g.about ? `  About: ${g.about}\n` : '';
    return `Group ${i + 1} — QUESTION: ${g.crux.question}\n${about}  A: ${g.crux.left}\n  B: ${g.crux.right}\n${lines.length ? lines.join('\n') : '  (no results)'}`;
  }).join('\n\n');
}

export function pickPrompt(groups) {
  return groups.map((g, i) => {
    const lines = (g.results || []).map((r, j) => `  ${j + 1}. ${r.title} (${hostOf(r.url)}${dateOf(r) ? `, ${dateOf(r)}` : ', date unknown'}): ${String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 320)}`);
    return `Group ${i + 1} — VIEW: ${g.label}\n${lines.length ? lines.join('\n') : '  (no results)'}`;
  }).join('\n\n');
}

// A page whose title denies a claim, cited for a line that denies nothing:
// it argues the other answer (see server/viewsDemo.js).
const TITLE_DENIES = /\b(not to blame|not the cause|is not|are not|was not|were not|did not|does not|do not|isn['’]t|aren['’]t|wasn['’]t|weren['’]t|didn['’]t|doesn['’]t|don['’]t|myths?|wrong|false|fallacy|fiction|nonsense|overblown|overstated|exaggerated)\b/i;
const SAYS_DENIES = /\b(not|no|never|n['’]t|unfounded|myths?|wrong|false|rejects?|disputes?|refutes?|denies|deny|exaggerat\w*|overstat\w*)\b|n['’]t\b/i;
export function titleDenies(result, says) {
  return TITLE_DENIES.test(String(result?.title || '')) && !SAYS_DENIES.test(String(says || ''));
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ---- when a page is from ---------------------------------------------------
// Tavily is now asked for `published_date`, but it is a best estimate and it is
// null for plenty of pages. A date in the URL is the next best thing: a fifth
// of the results in the 2026-11-24 run carried one. Returns "YYYY" or
// "YYYY-MM", or '' when nothing reliable is there.
// A bare year in a title is deliberately NOT read: titles name years they only
// discuss ("Internal Combustion Engine Bans" mentioned 2035), and a wrong date
// is worse than none.
const YEAR = '(19[5-9]\\d|20[0-4]\\d)';
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
export function dateOf(result) {
  const published = String(result?.published || '').trim();
  if (published) {
    const t = Date.parse(published);
    if (Number.isFinite(t)) {
      const d = new Date(t);
      // A date in the future is an estimate gone wrong.
      if (d.getUTCFullYear() >= 1950 && t <= Date.now() + 86400e3) {
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      }
    }
    const y = published.match(new RegExp(`\\b${YEAR}\\b`));
    if (y) return y[1];
  }
  const url = String(result?.url || '');
  let m = url.match(new RegExp(`/${YEAR}[/-](0[1-9]|1[0-2])(?:[/-](0[1-9]|[12]\\d|3[01]))?(?=[/-]|$)`));
  if (m) return `${m[1]}-${m[2]}`;
  if ((m = url.match(new RegExp(`/${YEAR}/`)))) return m[1];
  // A date leading the snippet: "14 Feb 2026 — …" or "2026-02-14 …".
  const snip = String(result?.snippet || '');
  if ((m = snip.match(new RegExp(`^\\s*(?:\\d{1,2}\\s+)?(?:${MONTHS})[a-z]*\\.?\\s+(?:\\d{1,2},?\\s+)?${YEAR}\\b`, 'i')))) return m[1];
  if ((m = snip.match(new RegExp(`^\\s*${YEAR}-(0[1-9]|1[0-2])-\\d\\d\\b`)))) return `${m[1]}-${m[2]}`;
  if ((m = url.match(new RegExp(`[-_]${YEAR}[-_./]`)))) return m[1];
  return '';
}

// ---- what is not an argument, and what standing a page has ----------------
// A map's pieces are meant to be advocacy: someone making the case for an
// answer. A live test on 2026-11-24 found four classes of page that cannot be
// that, however well the model reads them:
//   - an encyclopaedia entry (Wikipedia's "Passive nuclear safety" was placed
//     under "Yes, designs are fail-safe")
//   - a question-and-answer site or forum (a Stack Overflow thread, a Brainly
//     homework answer)
//   - a homework, essay-mill or study-notes upload (a student's persuasive
//     speech outline on Studocu, cited as "studies of car-free districts show…")
//   - a site's front page, which argues nothing (go.dev was cited for "Go's
//     fast build times accelerate development speed")
// Personal publishing platforms are here too, and that is a judgement call: a
// Medium post can be a real essay, but the map says a view is held by
// "organisations and people", and an anonymous post supports neither. See
// docs/views-review-2026-11-24.md.
const NOT_ARGUMENT_HOST = new RegExp(`(^|\\.)(${[
  // encyclopaedias and how-to references
  'wikipedia\\.org', 'wikiwand\\.com', 'britannica\\.com', 'fandom\\.com', 'wikihow\\.com', 'dbpedia\\.org',
  // questions and answers, forums
  'stackoverflow\\.com', 'stackexchange\\.com', 'superuser\\.com', 'serverfault\\.com', 'askubuntu\\.com',
  'brainly\\.(com|in|ph|co\\.id)', 'numerade\\.com', 'answers\\.com', 'doubtnut\\.com', 'toppr\\.com',
  // homework, essay mills, study notes
  'studocu\\.com', 'coursehero\\.com', 'coursesidekick\\.com', 'chegg\\.com', 'scribd\\.com', 'quizlet\\.com',
  'bartleby\\.com', 'studymode\\.com', 'gradesfixer\\.com', 'ivypanda\\.com', 'studycorgi\\.com', 'cram\\.com',
  'enotes\\.com', 'sparknotes\\.com', 'vaia\\.com', 'studysmarter\\.co\\.uk', 'docsity\\.com', 'studylib\\.net',
  'papersowl\\.com', 'edubirdie\\.com', 'ukessays\\.com', '123helpme\\.com', 'slideshare\\.net', 'studypool\\.com',
  'transtutors\\.com', 'homeworklib\\.com', 'vedantu\\.com', 'byjus\\.com', 'shaalaa\\.com',
  // personal publishing platforms
  'medium\\.com', 'blogspot\\.com', 'wordpress\\.com', 'tumblr\\.com', 'wixsite\\.com', 'weebly\\.com',
  'dev\\.to', 'hashnode\\.dev', 'hashmm\\.com', 'squarespace\\.com', 'blogspot\\.co\\.uk',
].join('|')})$`, 'i');

// A URL with no path of its own: a front page, a tag listing, a rolling index.
function frontPage(url) {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, '');
    return p === '' || /^\/(index|home|en|news|blog|about)$/i.test(p);
  } catch { return false; }
}

// True when the page cannot be anyone's argument, whatever the snippet says.
export function notAnArgument(url) {
  const h = hostOf(url);
  return !h || NOT_ARGUMENT_HOST.test(h) || frontPage(url);
}

// What the reader needs to weigh a page, in one or two words. Mosaic does not
// rule on a question, so a page of lesser standing is labelled rather than
// hidden: the live test found the denial side of "Do vaccines cause autism?"
// carried three pieces — a preprint, an open deposit and a document tabled by
// one senator at a Senate estimates hearing — against two peer-reviewed
// meta-analyses, and the tabled document was credited to "Australian
// Government (APH)". Shown as a tag, the reader sees what each one is.
const PREPRINT = /(^|\.)(arxiv\.org|biorxiv\.org|medrxiv\.org|psyarxiv\.com|chemrxiv\.org|preprints\.org|authorea\.com|researchsquare\.com|ssrn\.com|papers\.ssrn\.com|osf\.io)$/i;
const DEPOSIT = /(^|\.)(zenodo\.org|figshare\.com|academia\.edu|researchgate\.net|scribd\.com|archive\.org|hal\.science)$/i;
const REVIEWED = /(^|\.)(doi\.org|pmc\.ncbi\.nlm\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|nature\.com|science\.org|thelancet\.com|bmj\.com|nejm\.org|cell\.com|link\.springer\.com|sciencedirect\.com|onlinelibrary\.wiley\.com|tandfonline\.com|cambridge\.org|oup\.com|academic\.oup\.com|iopscience\.iop\.org|frontiersin\.org|plos\.org|jamanetwork\.com|annualreviews\.org|nber\.org|jstor\.org)$/i;
// A submission, a tabled paper or written evidence is one party's case, not the
// body that hosts it.
// A submission, a tabled paper, written evidence or one witness's testimony is
// one party's case, not the body that hosts it. Measured on the 2026-11-24 run:
// without `testimony` and `committeedocuments`, a witness statement filed with
// a Kentucky legislature committee came out labelled "Government or official
// body", which is the same laundering as the Australian tabled document.
const SUBMITTED_PATH = /(tabled[-_ ]?doc|tableddoc|\bsubmission|written[-_ ]?evidence|\bevidence[-_ ]?submitted|petition|consultation[-_ ]?response|\btestimony\b|committee[-_ ]?documents?)/i;
// A transcript records what someone said on a day. It is not the hosting body's
// position, and it is often decades old: a 1997 NATO transcript was cited on a
// ring about the 2022 invasion of Ukraine.
const TRANSCRIPT_PATH = /(\btranscripts?\b|\bremarks\b|\bspeeches\b|\bpress[-_ ]?conference)/i;

export function standingOf(url) {
  const h = hostOf(url);
  if (!h) return '';
  let path = '';
  try { path = new URL(url).pathname; } catch {}
  if (SUBMITTED_PATH.test(path)) return 'Submitted to a hearing';
  if (TRANSCRIPT_PATH.test(path)) return 'Transcript of remarks';
  if (PREPRINT.test(h)) return 'Preprint, not peer reviewed';
  if (DEPOSIT.test(h)) return 'Posted to an open archive';
  if (REVIEWED.test(h)) return 'Peer reviewed';
  if (/\.gov(\.[a-z]{2})?$/i.test(h) || /(^|\.)(europa\.eu|who\.int|un\.org|nato\.int|parliament\.uk)$/i.test(h)) return 'Government or official body';
  if (/\.(edu|ac\.[a-z]{2})$/i.test(h)) return 'University';
  return '';
}

const str = (v, n = 240) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
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
      id, name: str(v?.name, 48), short: cap(str(v?.short, 24) || str(v?.name, 24)), summary: str(v?.summary, 280),
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
    // Articles on this question itself, each arguing one of its two answers.
    const reading = (Array.isArray(c?.reading) ? c.reading : []).map((r) => {
      const src = cleanSource(r);
      const side = String(r?.side || '').toLowerCase();
      return src && (side === 'left' || side === 'right') ? { ...src, side, says: str(r?.says, 240) } : null;
    }).filter(Boolean).slice(0, 6);
    return { question: str(c?.question, 160), left: cap(str(c?.left, 60)), right: cap(str(c?.right, 60)), why: str(c?.why, 240), positions, reading };
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
export const SOURCE_COUNT = (map) => new Set([
  ...map.views.flatMap((v) => viewSources(v).map((s) => s.url)),
  ...(map.cruxes || []).flatMap((c) => (c.reading || []).map((s) => s.url)),
]).size;
