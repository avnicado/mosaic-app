// The Mandala's geometry and data: where today's items and what you've held
// sit on the chart. Sector (angle) = field, or a part of one field when the
// Mandala is opened into it. Ring (radius) = density (substance per minute —
// scoring.js's densityRing(), NOT length or complexity).
//
// The Mandala is where you lean (see Mandala.jsx): tapping a cell chooses a
// field and a depth, and the shelf composes from the lit area only
// (scoring.js's composeLeanShelf). It stays inside KERNEL §11 the way the shelf
// does: the lean is chosen and visible, it only filters and orders inside the
// lit area, and nothing learns from it.
//
// The corpus is NOT cumulative — server/corpus.js rebuilds it daily — so
// something you held a few days ago has usually rotated out of today's pool.
// It is still yours, so when it isn't in the pool we place it from the words
// you already have for it (the same deterministic heuristics scoring.js falls
// back to), only to fill its cell. That placement is never saved or composed.

import {
  BRIDGING_FLOOR, DENSITY_RING_COUNT, densityRing, DOMAINS, PARTS,
  heuristicDomain, heuristicDensity, heuristicPart,
} from '../../scoring.js';

export { DENSITY_RING_COUNT };

export const RING_BLURB = ['barely scratched', 'a light read', 'some substance', 'demanding', 'as dense as it gets'];
export const SHORT = {
  science: 'science', technology: 'technology', 'arts & culture': 'arts', 'philosophy & ideas': 'philosophy',
  'society & politics': 'society', 'business & economics': 'economics', 'health & mind': 'mind', history: 'history',
  'nature & environment': 'nature', 'sport & play': 'sport & play', 'craft & making': 'craft', 'math & abstraction': 'maths',
};

// heldRecords: [{ url, title, source, excerpt }] → [{ url, title, domain, part, ring }]
export function placeHeld(corpusItems, heldRecords) {
  const byUrl = new Map(corpusItems.filter((it) => it.url).map((it) => [it.url, it]));
  const out = [];
  const seen = new Set();
  for (const rec of heldRecords) {
    if (!rec.url || seen.has(rec.url)) continue;
    seen.add(rec.url);
    const it = byUrl.get(rec.url);
    if (it) {
      out.push({ url: rec.url, title: it.title, domain: it.domain, part: it.part ?? null, ring: densityRing(it.scores?.density ?? 0) });
    } else {
      const domain = heuristicDomain(rec);
      out.push({ url: rec.url, title: rec.title || rec.url, domain, part: heuristicPart(rec, domain), ring: densityRing(heuristicDensity(rec)), synthesized: true });
    }
  }
  return out;
}

export const admittedOf = (items) => items.filter((it) => (it.scores?.bridging ?? 0) >= BRIDGING_FLOOR);

// ---- geometry -----------------------------------------------------------------------
export const SIZE = 640;
export const C = SIZE / 2;
export const INNER = 38;
export const MAX_R = 226;
export const RT = (MAX_R - INNER) / DENSITY_RING_COUNT;

export const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
export function wedgePath(rIn, rOut, a0, a1) {
  const [sx, sy] = polar(rOut, a0), [ex, ey] = polar(rOut, a1), [ix, iy] = polar(rIn, a1), [jx, jy] = polar(rIn, a0);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${sx} ${sy}A${rOut} ${rOut} 0 ${big} 1 ${ex} ${ey}L${ix} ${iy}A${rIn} ${rIn} 0 ${big} 0 ${jx} ${jy}Z`;
}

// The slices for a view: every field, or one field's parts (zoom = domain).
// An item with no part sits in no part wedge; the zoomed view says how many.
export function slicesFor(zoom) {
  if (!zoom) return DOMAINS.map((d) => ({ domain: d, part: null, label: SHORT[d] }));
  return PARTS[zoom].map((p) => ({ domain: zoom, part: p, label: p }));
}

export function viewGeometry(zoom) {
  const slices = slicesFor(zoom);
  const sweep = (Math.PI * 2) / slices.length;
  const a0Of = (i) => -Math.PI / 2 + sweep * i + (zoom ? -sweep / 2 : 0);
  const indexOf = (it) => {
    if (!zoom) return DOMAINS.indexOf(it.domain);
    if (it.domain !== zoom || !it.part) return -1;
    return PARTS[zoom].indexOf(it.part);
  };
  return { slices, sweep, a0Of, indexOf };
}

// Dots: one per item, spread along its cell's arc in up to three rows. A busy
// cell (Hacker News fills technology) packs tighter rather than spilling over.
export function layoutDots(items, geo, zoom) {
  const byCell = new Map();
  for (const it of items) {
    const si = geo.indexOf(it);
    if (si < 0) continue;
    const k = si * 10 + densityRing(it.scores?.density ?? 0);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(it);
  }
  const dotR = zoom ? 6 : 4;
  const pos = new Map();
  for (const [k, list] of byCell) {
    const si = Math.floor(k / 10), r = k % 10;
    const a0 = geo.a0Of(si);
    const span = geo.sweep * 0.8;
    const rMid = INNER + RT * (r + 0.5);
    const arc = span * rMid;
    const perRow = Math.max(1, Math.floor(arc / (dotR * 2.6)));
    const rows = Math.min(3, Math.ceil(list.length / perRow));
    const inRow = Math.ceil(list.length / rows);
    list.forEach((it, i) => {
      const row = Math.floor(i / inRow);
      const col = i % inRow;
      const nThis = Math.min(inRow, list.length - row * inRow);
      const frac = (col + 1) / (nThis + 1);
      const a = a0 + geo.sweep * 0.1 + span * frac;
      const rr = rows === 1 ? rMid : rMid + (row - (rows - 1) / 2) * Math.min(RT / rows, dotR * 2.4);
      pos.set(it.url, { x: polar(rr, a)[0], y: polar(rr, a)[1], si, r });
    });
  }
  return { pos, dotR };
}
