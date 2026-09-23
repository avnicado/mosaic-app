// ============================================================
// MOSAIC — shared composition & scoring module
// ============================================================
// This module encodes KERNEL §11 ("Exploration: composed, never ranked").
// It is imported by BOTH:
//   - scripts/build-corpus.mjs   (Node, build-time — the Side-by-Side corpus)
//   - src/promenade logic        (browser, runtime — the live shelf)
// so that both surfaces provably compose by *identical* rules. The only thing
// that differs between the two callers is the transport injected for scoring
// (a Node-side fetch/Groq call at build time; the /api/llm proxy at runtime).
//
// Everything here is environment-agnostic ESM: no browser-only or Node-only
// global is referenced at module scope. Side effects (network) are injected.
//
// KERNEL invariants encoded here, and where:
//   §11.1  composed, never ranked ............ composeShelf(): slots filled independently
//   §11.2  admissible criteria ............... bridging score + domain/move-type + diversity + adjacency
//   §11.3  engagement = tie-break ONLY ....... engagementScore() is used only to break ties WITHIN a slot;
//                                              it is never a cross-slot sort key on the Mosaic side.
//   §11.4  visible marginalia ................ every scored item carries {slot, scores, why, scored_by}
//   §11.5  finite ............................ composeShelf() returns a fixed-size shelf, never a stream
// ============================================================

// The four functional slots are the kernel's own (KERNEL §3). Exploration reuses
// them: a shelf is composed of the same move-types the thread feed is.
export const SLOTS = ['sharpen', 'complicate', 'bridge', 'ground'];

export const SLOT_BLURB = {
  sharpen: 'cuts closer to a frame',
  complicate: 'resists an easy framing',
  bridge: 'same shape, distant field',
  ground: 'a concrete, specific case',
};

// A deliberately broad domain taxonomy so "domain spread as a rule" (§11.2) has
// real spread to enforce. Kept coarse on purpose — fine domains would let near-
// duplicates slip past the diversity constraint.
export const DOMAINS = [
  'science', 'technology', 'arts & culture', 'philosophy & ideas',
  'society & politics', 'business & economics', 'health & mind', 'history',
  'nature & environment', 'sport & play', 'craft & making', 'math & abstraction',
];

// Admissible composition criteria, named for the criteria panel the UIs render
// (§11.4 — composition is legible or it doesn't ship).
export const ADMISSIBLE_CRITERIA = [
  'Bridging-quality score (constructive/curious/nuanced, minus toxicity)',
  'LLM- or Perspective-classified domain',
  'LLM- or heuristic-classified move-type (which slot it fills)',
  'Domain-spread constraint (a rule, not a learned preference)',
  'Adjacency to the reader’s existing thread shapes',
];

// An item must clear this bridging-quality floor to be admitted to the Mosaic
// side (§11.2). Ragebait and low-constructiveness items score below it and are
// simply not composed in — they are not "down-ranked", they are inadmissible.
export const BRIDGING_FLOOR = 0.35;

// ------------------------------------------------------------
// Perspective API — the primary bridging-score path.
// ------------------------------------------------------------
// The bridging/constructive attributes have migrated between Perspective's
// experimental and production tiers, so we do NOT hardcode a remembered list and
// assume it works. We request a candidate set, and if the API rejects an
// attribute the key can't access we drop it and retry, recording exactly which
// attributes actually scored the corpus (surfaced in corpus metadata + the
// criteria panel). See scoreWithPerspective().
export const PERSPECTIVE_CANDIDATE_ATTRIBUTES = [
  // constructive / bridging family (experimental at time of writing)
  'REASONING_EXPERIMENTAL',
  'NUANCE_EXPERIMENTAL',
  'CURIOSITY_EXPERIMENTAL',
  'RESPECT_EXPERIMENTAL',
  'COMPASSION_EXPERIMENTAL',
  'PERSONAL_STORY_EXPERIMENTAL',
  'AFFINITY_EXPERIMENTAL',
  // production toxicity family — used as a penalty, never a positive signal
  'TOXICITY',
];
const PERSPECTIVE_NEGATIVE = new Set(['TOXICITY', 'SEVERE_TOXICITY', 'INSULT', 'THREAT']);

// ------------------------------------------------------------
// Engagement — used ONLY as a within-slot tie-breaker (§11.3) and to order the
// Side-by-Side's *left* (engagement) column, which exists precisely to show what
// Mosaic refuses. Never call this to sort the Mosaic side across slots.
// ------------------------------------------------------------
export function engagementScore(item, now = Date.now()) {
  const votes = Number(item?.engagement?.votes) || 0;
  const comments = Number(item?.engagement?.comments) || 0;
  const ts = Number(item?.timestamp) || now;
  const ageHours = Math.max(0, (now - ts) / 3.6e6);
  // Comment velocity weighted above raw votes; classic recency decay (~36h half-life).
  const raw = votes + comments * 2;
  const decay = Math.pow(0.5, ageHours / 36);
  return raw * decay;
}

// Order a pool the way every engagement feed does: by decayed engagement, desc.
// This is the LEFT side of the Side-by-Side. It is intentionally the thing the
// kernel refuses; it lives here only so the contrast can be made honest.
export function orderByEngagement(items, now = Date.now()) {
  return [...items].sort((a, b) => engagementScore(b, now) - engagementScore(a, now));
}

// ------------------------------------------------------------
// Heuristic classification — the last-resort path, and what keeps corpus.json
// reproducible offline with no key and no network. Deterministic: same item in,
// same classification out.
// ------------------------------------------------------------
const DOMAIN_KEYWORDS = {
  science: ['physics', 'chemistry', 'biology', 'quantum', 'astronomy', 'genome', 'neuroscience', '研究', 'experiment', 'particle', 'telescope', 'protein'],
  technology: ['software', 'programming', 'compiler', 'ai', 'llm', 'gpu', 'database', 'kernel', 'rust', 'python', 'javascript', 'startup', 'api', 'linux', 'server'],
  'arts & culture': ['film', 'music', 'novel', 'poetry', 'painting', 'architecture', 'design', 'photography', 'theatre', 'album', 'artist', 'museum'],
  'philosophy & ideas': ['philosophy', 'ethics', 'consciousness', 'meaning', 'stoic', 'metaphysic', 'epistem', 'moral', 'free will'],
  'society & politics': ['policy', 'election', 'democracy', 'immigration', 'inequality', 'protest', 'government', 'law', 'rights', 'war'],
  'business & economics': ['market', 'economy', 'inflation', 'startup funding', 'venture', 'trade', 'labor', 'wages', 'monetary', 'finance'],
  'health & mind': ['health', 'medicine', 'psychology', 'depression', 'sleep', 'nutrition', 'therapy', 'cancer', 'brain', 'mental'],
  history: ['history', 'ancient', 'medieval', 'empire', 'war of', 'century', 'archaeolog', 'dynasty', 'revolution'],
  'nature & environment': ['climate', 'ecology', 'species', 'forest', 'ocean', 'wildlife', 'carbon', 'biodiversity', 'river', 'coral'],
  'sport & play': ['football', 'chess', 'olympic', 'climbing', 'marathon', 'basketball', 'game design', 'poker', 'cycling'],
  'craft & making': ['woodworking', 'blacksmith', 'knitting', 'ceramics', 'homebuilt', 'diy', 'restoration', 'handmade', 'bread', 'garden'],
  'math & abstraction': ['theorem', 'proof', 'topology', 'algebra', 'geometry', 'probability', 'number theory', 'algorithm', 'combinator'],
};

export function heuristicDomain(item) {
  const hay = `${item.title || ''} ${item.excerpt || ''} ${item.source || ''}`.toLowerCase();
  let best = null, bestHits = 0;
  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS)) {
    let hits = 0;
    for (const w of words) if (hay.includes(w)) hits += 1;
    if (hits > bestHits) { best = domain; bestHits = hits; }
  }
  if (best) return best;
  // No keyword hit (common for title-only HN links). Prefer a caller-supplied
  // hint — a feed's topic, or a source prior — before falling back to a hash, so
  // "GPT-5.6" lands in technology, not a random bucket.
  if (item._hint && DOMAINS.includes(item._hint)) return item._hint;
  if (/hacker news/i.test(item.source || '')) return 'technology';
  // Deterministic last resort: hash into the taxonomy so unclassified items
  // still spread rather than piling into one bucket.
  return DOMAINS[hashString(item.url || item.title || '') % DOMAINS.length];
}

const MOVE_CUES = {
  ground: ['show hn', 'how i ', 'i built', 'field notes', 'a day in', 'interview', 'walkthrough', 'case study', 'my experience', 'photos', 'diary', 'postmortem', 'teardown'],
  complicate: ['why ', 'the problem with', 'myth', 'actually', 'against ', 'is wrong', 'considered harmful', 'stop ', 'rethinking', 'the case against', 'overrated'],
  bridge: ['what x can teach', 'lessons from', 'borrowed from', 'like a', 'as a metaphor', 'parallels', 'analogy', 'across disciplines'],
};

export function heuristicMoveType(item) {
  const t = `${item.title || ''}`.toLowerCase();
  for (const move of ['ground', 'complicate', 'bridge']) {
    if (MOVE_CUES[move].some((c) => t.includes(c))) return move;
  }
  // Default: an item that sits inside a frame sharpens it. Deterministic jitter
  // spreads the long tail so slots aren't starved of candidates.
  const spill = ['sharpen', 'sharpen', 'ground', 'bridge', 'complicate'];
  return spill[hashString(item.title || item.url || '') % spill.length];
}

// Deterministic 0..1 bridging quality with no network. Rewards curiosity/nuance
// markers and question-shaped titles; penalizes ragebait vocabulary. Coarse by
// design — it is the floor's last resort, not its ideal.
const CONSTRUCTIVE_MARKERS = ['how', 'why', 'what', 'question', 'nuance', 'consider', 'depends', 'both', 'tension', 'trade-off', 'tradeoff', 'perhaps', 'reconsider', 'curious', 'wonder', 'notes on', 'a study of'];
const RAGE_MARKERS = ['destroys', 'owns', 'slams', 'shocking', 'you won’t believe', 'hate', 'idiots', 'clickbait', 'furious', 'triggered', 'ratio', 'cope'];

export function heuristicBridging(item) {
  const t = `${item.title || ''} ${item.excerpt || ''}`.toLowerCase();
  let s = 0.5;
  for (const m of CONSTRUCTIVE_MARKERS) if (t.includes(m)) s += 0.05;
  for (const m of RAGE_MARKERS) if (t.includes(m)) s -= 0.18;
  if ((item.title || '').includes('?')) s += 0.08;
  if ((item.excerpt || '').length > 120) s += 0.05; // substance over headline-only
  return clamp01(s);
}

// ------------------------------------------------------------
// Perspective path (bridging score only — it does not classify domain/move-type)
// ------------------------------------------------------------
// Requires: { apiKey, fetchImpl }. Returns { bridging, attributes, raw } or null
// if Perspective is unavailable/errors, so the caller can fall through to the
// LLM or heuristic path. Drops any attribute the key can't access and retries,
// recording which attributes actually scored — this dual path IS the
// Perspective-sunset migration architecture, not a hack: when the experimental
// bridging attributes are retired, the same call simply resolves to fewer
// attributes (or none), and scoring falls through to the LLM classifier below.
export async function scoreWithPerspective(item, { apiKey, fetchImpl }) {
  if (!apiKey) return null;
  const fetchFn = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchFn) return null;
  const text = `${item.title || ''}. ${item.excerpt || ''}`.slice(0, 3000);
  let attrs = [...PERSPECTIVE_CANDIDATE_ATTRIBUTES];

  for (let attempt = 0; attempt < PERSPECTIVE_CANDIDATE_ATTRIBUTES.length; attempt++) {
    if (attrs.length === 0) return null;
    const body = {
      comment: { text },
      languages: ['en'],
      requestedAttributes: Object.fromEntries(attrs.map((a) => [a, {}])),
    };
    try {
      const res = await fetchFn(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (res.status === 400) {
        // An attribute the key can't access. Parse it out, drop it, retry.
        const err = await res.json().catch(() => ({}));
        const bad = findUnsupportedAttribute(err, attrs);
        if (bad) { attrs = attrs.filter((a) => a !== bad); continue; }
        return null;
      }
      if (!res.ok) return null;
      const json = await res.json();
      const used = [];
      let pos = 0, posN = 0, neg = 0, negN = 0;
      for (const a of attrs) {
        const v = json.attributeScores?.[a]?.summaryScore?.value;
        if (typeof v !== 'number') continue;
        used.push(a);
        if (PERSPECTIVE_NEGATIVE.has(a)) { neg += v; negN += 1; }
        else { pos += v; posN += 1; }
      }
      if (used.length === 0) return null;
      const positive = posN ? pos / posN : 0.5;
      const penalty = negN ? neg / negN : 0;
      return { bridging: clamp01(positive - penalty * 0.6), attributes: used, raw: json.attributeScores };
    } catch {
      return null;
    }
  }
  return null;
}

function findUnsupportedAttribute(errBody, attrs) {
  const msg = JSON.stringify(errBody || '').toUpperCase();
  for (const a of attrs) if (msg.includes(a)) return a;
  return attrs[attrs.length - 1]; // give up on the last candidate if unnamed
}

// ------------------------------------------------------------
// LLM classification path — domain + move-type (+ bridging when Perspective is
// absent). Requires an injected `classify(prompt)` that returns raw text; the
// caller wires it to Groq-direct (Node) or /api/llm (browser). Same output
// schema either way.
// ------------------------------------------------------------
export function buildClassifyPrompt(item) {
  return `You are the composition classifier for Mosaic, an inquiry platform. You are NOT ranking this item and NOT judging popularity. Classify one item structurally so it can fill a functional slot.

ITEM
Title: ${item.title || ''}
Source: ${item.source || ''}
Excerpt: ${(item.excerpt || '').slice(0, 400)}

Return ONLY valid JSON:
{
  "domain": "pick the SINGLE closest from: ${DOMAINS.join(', ')}",
  "moveType": "which slot this best fills — one of: sharpen (a distinction inside a frame), complicate (a case/tension a framing flattens), bridge (same shape, distant field), ground (a concrete case/primary material)",
  "bridging": 0.0,
  "why": "one sentence: what makes this item worth composing in, structurally (not that it's popular)"
}
"bridging" is 0.0-1.0: how constructive/curious/nuanced the item is (high) vs. ragebait/contentless (low).`;
}

export async function classifyWithLLM(item, { classify }) {
  if (!classify) return null;
  try {
    const text = await classify(buildClassifyPrompt(item));
    const parsed = parseLooseJSON(text);
    if (!parsed) return null;
    return {
      domain: DOMAINS.includes(parsed.domain) ? parsed.domain : heuristicDomain(item),
      moveType: SLOTS.includes(parsed.moveType) ? parsed.moveType : heuristicMoveType(item),
      bridging: clamp01(Number(parsed.bridging)),
      why: typeof parsed.why === 'string' ? parsed.why : '',
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// scoreItem — the orchestrator both callers use. Tries Perspective for the
// bridging score, LLM for domain/move-type (and bridging if Perspective is
// absent), and always falls through to the deterministic heuristic so an item
// is never left unscored. Records provenance in `scored_by`.
// ------------------------------------------------------------
export async function scoreItem(item, opts = {}) {
  const { apiKey, fetchImpl, classify } = opts;

  const persp = await scoreWithPerspective(item, { apiKey, fetchImpl });
  const llm = await classifyWithLLM(item, { classify });

  const domain = llm?.domain || heuristicDomain(item);
  const moveType = llm?.moveType || heuristicMoveType(item);

  let bridging, scored_by, perspectiveAttributes = null;
  if (persp) {
    bridging = persp.bridging;
    perspectiveAttributes = persp.attributes;
    scored_by = 'perspective';
  } else if (llm && Number.isFinite(llm.bridging)) {
    bridging = llm.bridging;
    scored_by = 'llm';
  } else {
    bridging = heuristicBridging(item);
    scored_by = 'heuristic';
  }

  return {
    ...item,
    domain,
    moveType,
    slot: moveType,
    scores: { bridging: round2(bridging), engagement: round2(engagementScore(item)) },
    why: llm?.why || `${SLOT_BLURB[moveType]} — in ${domain}`,
    scored_by,
    perspectiveAttributes,
  };
}

// ------------------------------------------------------------
// composeShelf — the core of KERNEL §11. Fills each slot independently from the
// admissible pool. Never sorts the pool by engagement across slots.
//   1. Admit only items over the bridging floor (§11.2).
//   2. For each slot, take that slot's candidates.
//   3. Enforce domain spread as a RULE: at most one card per domain per slot.
//   4. Prefer adjacency to the reader's thread domains (§11.2), then break
//      remaining ties by engagement (§11.3 — the ONLY place engagement enters).
//   5. Return a finite shelf (§11.5).
// perSlot controls shelf size; userDomains drives adjacency (empty = no reader).
// ------------------------------------------------------------
export function composeShelf(scoredPool, { perSlot = 3, userDomains = [], now = Date.now(), ratingFor = null } = {}) {
  const admitted = scoredPool.filter((it) => (it.scores?.bridging ?? 0) >= BRIDGING_FLOOR);
  const nearSet = new Set(userDomains);
  const shelf = [];

  for (const slot of SLOTS) {
    const candidates = admitted.filter((it) => it.slot === slot);
    // Rank candidates WITHIN the slot: adjacency first (a composition criterion,
    // §11.2), then combined quality (bridging + optional user ratings — the
    // `ratings` flag / Q2, an additional WITHIN-slot quality input, never a
    // cross-slot sort key), then engagement purely as a tie-breaker (§11.3).
    // This comparator is the only engagement use on the Mosaic side, and it
    // never crosses slots.
    candidates.sort((a, b) => {
      const adjA = nearSet.has(a.domain) ? 1 : 0;
      const adjB = nearSet.has(b.domain) ? 1 : 0;
      if (adjA !== adjB) return adjB - adjA;
      const qA = withinSlotQuality(a, ratingFor), qB = withinSlotQuality(b, ratingFor);
      if (Math.abs(qA - qB) > 0.001) return qB - qA;
      return engagementScore(b, now) - engagementScore(a, now); // tie-break only
    });

    // Diversity constraint: at most one card per domain in this slot.
    const seenDomains = new Set();
    let taken = 0;
    for (const it of candidates) {
      if (seenDomains.has(it.domain)) continue;
      seenDomains.add(it.domain);
      shelf.push({ ...it, slot, tieBrokenByEngagement: seenDomains.size > 1 });
      if (++taken >= perSlot) break;
    }
  }
  return shelf;
}

// ------------------------------------------------------------
// composePromenadeShelf — the three visible sections of the Promenade. Uses the
// SAME primitives as composeShelf so the two surfaces compose by identical rules:
//   - near : items whose domain is adjacent to the reader's thread shapes
//   - far  : items deliberately distant from everything the reader holds,
//            domain-spread enforced across the whole section (no repeat domains)
//   - live : editorial/staff centers (passed in separately, labeled honestly)
// If the reader holds no threads, `near` collapses to a second `far` field.
// ------------------------------------------------------------
export function composePromenadeShelf(scoredPool, { userDomains = [], editorial = [], perSection = 3, now = Date.now(), ratingFor = null } = {}) {
  const admitted = scoredPool.filter((it) => (it.scores?.bridging ?? 0) >= BRIDGING_FLOOR);
  const hasThreads = userDomains.length > 0;
  const nearSet = new Set(userDomains);
  const used = new Set();

  const pickNear = () => {
    const cands = admitted
      .filter((it) => !used.has(it.url) && nearSet.has(it.domain))
      .sort((a, b) => sortWithinSection(a, b, nearSet, now, ratingFor));
    return takeMoveVaried(cands, perSection, used);
  };

  // Far field: distant from everything held, with domain spread enforced as a
  // RULE across the section (no two cards share a domain), and move-type variety.
  const pickFar = (avoidDomains, n) => {
    const cands = admitted
      .filter((it) => !used.has(it.url) && !avoidDomains.has(it.domain))
      .sort((a, b) => (withinSlotQuality(b, ratingFor)) - (withinSlotQuality(a, ratingFor))
        || engagementScore(b, now) - engagementScore(a, now));
    return takeDomainSpread(cands, n, used);
  };

  let near, far;
  if (hasThreads) {
    near = pickNear();
    far = pickFar(nearSet, perSection);
  } else {
    // No reader shapes yet: the near slot swaps to a second Far field (§11 note).
    near = pickFar(new Set(), perSection);
    far = pickFar(new Set(near.map((x) => x.domain)), perSection);
  }

  return {
    hasThreads,
    sections: [
      {
        key: 'near',
        title: hasThreads ? 'Near your threads' : 'Far field',
        note: hasThreads
          ? 'Close to the threads you already hold.'
          : "Not tuned to you yet — once you hold a thread, this shelf leans toward it.",
        cards: near,
      },
      {
        key: 'far',
        title: 'Far field',
        note: 'Far from everything you hold — each card from a different field.',
        cards: far,
      },
      {
        key: 'live',
        title: 'Live questions',
        note: 'Open questions to try on. Hold one to make it a thread.',
        cards: editorial.slice(0, perSection),
      },
    ],
  };
}

function sortWithinSection(a, b, nearSet, now, ratingFor = null) {
  const qA = withinSlotQuality(a, ratingFor), qB = withinSlotQuality(b, ratingFor);
  if (Math.abs(qA - qB) > 0.001) return qB - qA;
  return engagementScore(b, now) - engagementScore(a, now); // tie-break only
}

// Within-slot quality = bridging, optionally blended with a user rating for this
// item (the `ratings` flag / OPEN_QUESTIONS Q2). `ratingFor(item)` returns 0..1
// or null. This is an additional WITHIN-slot quality input — it changes the order
// of candidates *inside* one slot, never the order across slots, so Invariant I
// still binds. Engagement remains a pure tie-breaker, applied after this.
export function withinSlotQuality(item, ratingFor = null) {
  const bridging = item.scores?.bridging ?? 0;
  if (!ratingFor) return bridging;
  const r = ratingFor(item);
  if (typeof r !== 'number' || Number.isNaN(r)) return bridging;
  return 0.6 * bridging + 0.4 * clamp01(r);
}

// Take up to n items, preferring move-type variety (don't fill a section with
// five complications — KERNEL amendment: "respect move-type variety").
function takeMoveVaried(cands, n, used) {
  const out = [];
  const seenMoves = new Set();
  for (const pass of [true, false]) {
    for (const it of cands) {
      if (out.length >= n) break;
      if (used.has(it.url)) continue;
      if (pass && seenMoves.has(it.moveType)) continue;
      out.push(it); used.add(it.url); seenMoves.add(it.moveType);
    }
  }
  return out;
}

// Take up to n items with no two sharing a domain (the far-field diversity rule).
function takeDomainSpread(cands, n, used) {
  const out = [];
  const seenDomains = new Set();
  for (const it of cands) {
    if (out.length >= n) break;
    if (used.has(it.url) || seenDomains.has(it.domain)) continue;
    out.push(it); used.add(it.url); seenDomains.add(it.domain);
  }
  return out;
}

// ------------------------------------------------------------
// small pure helpers
// ------------------------------------------------------------
export function clamp01(x) { return Math.max(0, Math.min(1, Number(x) || 0)); }
function round2(x) { return Math.round((Number(x) || 0) * 100) / 100; }
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// Tolerant JSON extraction — mirrors mosaic.jsx's parseJSON so the classifier
// path survives code-fenced / preamble-wrapped LLM output.
export function parseLooseJSON(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = s.search(/[{[]/);
  if (start === -1) return null;
  const open = s[start], close = open === '{' ? '}' : ']';
  let depth = 0, end = -1;
  for (let i = start; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  let block = s.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
  try { return JSON.parse(block); } catch { return null; }
}
