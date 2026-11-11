// The Mandala: a radial view of the Promenade's corpus, alongside the shelf.
// Sector (angle) = domain. Ring (radius) = density (substance per minute —
// scoring.js's densityRing(), NOT length or complexity). A domain's wedge is
// filled from the center out by what you've already held. Every ring you
// haven't filled yet carries its own composed, unheld pick, read straight
// off the mandala (hover the ring) — not routed through the shelf.
//
// The corpus is NOT cumulative — server/corpus.js rebuilds it fresh from live
// feeds roughly daily (server/routes/corpus.js, MAX_AGE_MS), so anything you
// held even a couple of days ago has usually already rotated out of today's
// pool entirely. A held item is still "yours" regardless, so when it isn't
// in the current pool we score it on the spot from the words you already
// have for it (title/excerpt/source — the same deterministic heuristics
// scoring.js uses as its own no-network fallback), just to place it on the
// chart. That score is never persisted and never re-used for composition.
//
// This stays inside KERNEL §11 / Invariant I the same way the shelf does:
//   - composed, never ranked: a ring's pick is chosen by the same within-slot
//     criteria scoring.js already uses (bridging/density fit, then
//     engagement as a pure tie-break), never a cross-ring or cross-domain sort.
//   - legible: every cell's reason is its position (domain × density ring)
//     plus, for its pick, the same `why` the corpus already carries.
//   - finite: at most one recommended pick per empty cell — never a stream,
//     and the chart itself bounds the total (domains × 5 rings).
//   - private: which cells are "seen" comes from the reader's own held
//     record, never shown to anyone else.

import {
  BRIDGING_FLOOR, DENSITY_RING_COUNT, densityRing,
  engagementScore, withinSlotQuality, heuristicDomain, heuristicDensity,
} from '../../scoring.js';

export { DENSITY_RING_COUNT };

function pickFor(items, held, ratingFor, now) {
  const candidates = items.filter((it) => !held.has(it.url));
  candidates.sort((a, b) => {
    const qA = withinSlotQuality(a, ratingFor), qB = withinSlotQuality(b, ratingFor);
    if (Math.abs(qA - qB) > 0.001) return qB - qA;
    return engagementScore(b, now) - engagementScore(a, now); // tie-break only
  });
  return candidates[0] || null;
}

// heldRecords: [{ url, title, source, excerpt }] — a thread's seed, or an
// item found inside a session. url is required; everything else is best-effort.
// → [{ domain, total, frontier, rings: [{ seenCount, seenItems, pick }] }]
export function buildMandala(corpusItems, heldRecords, { ratingFor = null, now = Date.now() } = {}) {
  const byUrl = new Map(corpusItems.filter((it) => it.url).map((it) => [it.url, it]));
  const admitted = corpusItems.filter((it) => (it.scores?.bridging ?? 0) >= BRIDGING_FLOOR);
  const heldUrls = new Set(heldRecords.map((r) => r.url).filter(Boolean));

  // Resolve every held record to a { domain, density, title, url, source }
  // place-on-the-chart entry: from today's pool when it's still there
  // (real, LLM-or-heuristic-scored density), synthesized from its own stored
  // words otherwise. Dedupe by url — a thread's seed and a later item can
  // repeat the same url.
  const seenEntries = [];
  const seenSeenUrls = new Set();
  for (const rec of heldRecords) {
    if (!rec.url || seenSeenUrls.has(rec.url)) continue;
    seenSeenUrls.add(rec.url);
    const fromPool = byUrl.get(rec.url);
    seenEntries.push(fromPool
      ? { domain: fromPool.domain || 'other', density: fromPool.scores?.density ?? 0, title: fromPool.title, url: rec.url }
      : { domain: heuristicDomain(rec), density: heuristicDensity(rec), title: rec.title || rec.url, url: rec.url, synthesized: true });
  }

  const byDomain = new Map();
  for (const it of admitted) {
    const d = it.domain || 'other';
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(it);
  }
  // Make sure a domain you've explored still gets a wedge even if today's
  // pool happens to carry nothing admissible in it right now.
  for (const e of seenEntries) if (!byDomain.has(e.domain)) byDomain.set(e.domain, []);

  const domains = [];
  for (const [domain, items] of byDomain) {
    const buckets = Array.from({ length: DENSITY_RING_COUNT }, () => []);
    for (const it of items) buckets[densityRing(it.scores?.density ?? 0)].push(it);

    const seenBuckets = Array.from({ length: DENSITY_RING_COUNT }, () => []);
    for (const e of seenEntries) if (e.domain === domain) seenBuckets[densityRing(e.density)].push(e);

    let deepestSeen = -1;
    const rings = buckets.map((bucket, r) => {
      const seenItems = seenBuckets[r];
      if (seenItems.length && r > deepestSeen) deepestSeen = r;
      // A ring with nothing seen yet carries one composed pick — read directly
      // off the mandala (no click-through to the shelf required).
      const pick = seenItems.length ? null : pickFor(bucket, heldUrls, ratingFor, now);
      return { seenCount: seenItems.length, seenItems, pick };
    });

    // Frontier: the shallowest ring with nothing seen, or one past the
    // deepest seen ring if every shallower ring already has something —
    // "the next place to go", read off the reader's own record. Used only
    // as the panel's initial focus before the reader hovers anything.
    let frontier = rings.findIndex((r) => r.seenCount === 0);
    if (frontier === -1) frontier = Math.min(DENSITY_RING_COUNT - 1, deepestSeen + 1);

    domains.push({ domain, total: items.length, rings, frontier });
  }

  return domains.sort((a, b) => b.total - a.total);
}
