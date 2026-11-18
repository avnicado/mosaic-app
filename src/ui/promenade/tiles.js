// The tiled Mandala's stonework: today's pieces laid into the Mandala as a
// mosaic. Pure; no React.
//
// Angle = field (or, stepped inside one, its parts). Each field's slice is
// filled edge to edge by its own pieces, with no gaps and no filler: a power
// diagram (a weighted Voronoi) whose weights are tuned until every tile's area
// is its share of the slice by length in minutes. So inside a field sizes
// compare exactly (an hour-long piece takes twelve times the room of a
// five-minute one); between fields only roughly, since a field with more
// hours of reading packs its tiles tighter.
//
// Radius = depth: each piece's stone starts in its density ring
// (scoring.js's densityRing), equal-area bands, centre shallow. It may lean
// part way out of its band to get its full size.
//
// Colour is the reading mosaic's tessera (ui/mosaic/geometry.js): hue is the
// field, darkness is density.
import { mulberry32, hashStr, clamp } from '../mosaic/geometry.js';
import { DOMAINS, PARTS, DENSITY_RING_COUNT, itemRing } from '../../scoring.js';

export const SIZE = 640;
export const C = SIZE / 2;
export const INNER = 50;
export const R = 262;
export const MIN_MINUTES = 3;

export const SHORT = {
  science: 'science', technology: 'technology', 'arts & culture': 'arts', 'philosophy & ideas': 'philosophy',
  'society & politics': 'society', 'business & economics': 'economics', 'health & mind': 'mind', history: 'history',
  'nature & environment': 'nature', 'sport & play': 'sport & play', 'craft & making': 'craft', 'math & abstraction': 'maths',
};
export const UNSORTED = '(unsorted)';

// Equal-area depth bands, so a deep tile isn't bigger just because it sits further out.
export const band = (k) => Math.sqrt(INNER * INNER + (k / DENSITY_RING_COUNT) * (R * R - INNER * INNER));
export const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];

// ---- polygons -------------------------------------------------------------------------
export function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
export function polyCentroid(p) {
  let s = 0, x = 0, y = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], c = a[0] * b[1] - b[0] * a[1];
    s += c; x += (a[0] + b[0]) * c; y += (a[1] + b[1]) * c;
  }
  if (Math.abs(s) < 1e-6) { let mx = 0, my = 0; p.forEach((q) => { mx += q[0]; my += q[1]; }); return [mx / p.length, my / p.length]; }
  return [x / (3 * s), y / (3 * s)];
}
// Widest circle around the centroid that stays inside: where words can go.
export function inRadius(poly, c) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ey = b[1] - a[1], L = ex * ex + ey * ey || 1;
    const t = clamp(((c[0] - a[0]) * ex + (c[1] - a[1]) * ey) / L, 0, 1);
    m = Math.min(m, Math.hypot(c[0] - a[0] - ex * t, c[1] - a[1] - ey * t));
  }
  return m;
}
export const pathOf = (poly) => poly.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';

// ---- one slice ------------------------------------------------------------------------
// items: [{ key, ring, minutes }] → [{ key, poly, area }]. The pieces fill the
// wedge from a0 to a1 exactly, each in proportion to its minutes.
//
// Broken-tile cutting: the wedge (its inner edge taken as a straight chord,
// so every piece stays convex) is split by a straight crack into two parts
// whose areas are the two halves' minutes, then each part again, until every
// piece has its own stone. Pieces are ordered by depth, so the crack that
// separates shallower from denser runs across the wedge and the shallow half
// goes to the centre side. Each crack is tilted a little at random, which is
// what makes the stones irregular. Areas are exact and no piece can vanish.
const wedge = (a0, a1) => {
  const pts = [];
  const n = Math.max(3, Math.ceil(((a1 - a0) * R) / 7));
  for (let i = 0; i <= n; i++) pts.push(polar(R, a0 + ((a1 - a0) * i) / n));
  pts.push(polar(INNER, a1), polar(INNER, a0));
  return pts;
};
// The part of a convex polygon where p·n ≤ t, and where it is ≥ t.
function halfPlane(poly, n, t, keepLow) {
  const out = [];
  const f = (p) => (keepLow ? 1 : -1) * (p[0] * n[0] + p[1] * n[1] - t);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) { const k = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
// Cut poly along normal n so the low side holds `share` of its area.
function cutAt(poly, n, share) {
  let lo = Infinity, hi = -Infinity;
  for (const p of poly) { const v = p[0] * n[0] + p[1] * n[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const total = polyArea(poly), want = share * total;
  let a = lo, b = hi;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (polyArea(halfPlane(poly, n, m, true)) < want) a = m; else b = m;
  }
  const t = (a + b) / 2;
  return [halfPlane(poly, n, t, true), halfPlane(poly, n, t, false)];
}
// The polygon's long axis (by its extent along a few directions), as an angle.
function longAxis(poly) {
  let best = 0, bestW = -1;
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI, n = [Math.cos(ang), Math.sin(ang)];
    let lo = Infinity, hi = -Infinity;
    for (const p of poly) { const v = p[0] * n[0] + p[1] * n[1]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (hi - lo > bestW) { bestW = hi - lo; best = ang; }
  }
  return { ang: best, width: bestW };
}

export function tileSlice(a0, a1, items, seed, { round = true } = {}) {
  if (!items.length) return [];
  const rand = mulberry32(seed);
  const pieces = items.map((it) => ({ key: it.key, ring: it.ring || 0, w: Math.max(MIN_MINUTES, it.minutes || 0), tie: rand() }))
    .sort((a, b) => a.ring - b.ring || a.tie - b.tie);
  const out = [];
  const split = (poly, list) => {
    if (list.length === 1) { out.push({ key: list[0].key, poly, area: polyArea(poly) }); return; }
    // Two runs of the depth order with sums as even as can be.
    const total = list.reduce((s, x) => s + x.w, 0);
    let acc = 0, k = 1, bestD = Infinity;
    for (let i = 1; i < list.length; i++) {
      acc += list[i - 1].w;
      const d = Math.abs(acc - total / 2);
      if (d < bestD) { bestD = d; k = i; }
    }
    const A = list.slice(0, k), B = list.slice(k);
    const share = A.reduce((s, x) => s + x.w, 0) / total;
    const c = polyCentroid(poly);
    const radial = Math.atan2(c[1] - C, c[0] - C);
    const { ang: axis } = longAxis(poly);
    // Across the long axis, so stones stay chunky; when the two runs differ in
    // depth and the piece is deep enough radially, across the radius instead,
    // so the shallower run lands on the centre side.
    const deeper = B[0].ring > A[A.length - 1].ring || (B.reduce((s, x) => s + x.ring, 0) / B.length) - (A.reduce((s, x) => s + x.ring, 0) / A.length) > 0.4;
    const along = Math.abs(Math.cos(axis - radial));
    let normal = deeper && along > 0.35 ? radial : axis;
    normal += (rand() - 0.5) * 0.9; // the crack's tilt
    const n = [Math.cos(normal), Math.sin(normal)];
    // The low side of n is the one nearer the centre when n points outward.
    const outward = Math.cos(normal - radial) >= 0;
    const [low, high] = cutAt(poly, n, outward ? share : 1 - share);
    if (outward) { split(low, A); split(high, B); } else { split(high, A); split(low, B); }
  };
  const region = wedge(a0, a1);
  split(region, pieces);
  return (round && relax(out, region)) || out;
}

// Rounder stones: the cut pieces seed a power diagram (a weighted Voronoi),
// whose weights are then tuned until each cell's area is back to its piece's
// share. Used only when every piece keeps a stone within a third of its size;
// otherwise the cut pieces stand.
function powerCells(sites, region) {
  return sites.map((s, i) => {
    let cell = region;
    for (let j = 0; j < sites.length && cell.length > 2; j++) {
      if (j === i) continue;
      const o = sites[j];
      const n = [o.x - s.x, o.y - s.y], len = Math.hypot(n[0], n[1]) || 1e-9;
      // Power bisector: p·n ≤ (|o|² − |s|² − wo + ws) / 2.
      const t = (o.x * o.x + o.y * o.y - s.x * s.x - s.y * s.y - o.w + s.w) / 2;
      cell = halfPlane(cell, [n[0] / len, n[1] / len], t / len, true);
    }
    return cell;
  });
}
function relax(tiles, region, rounds = 70) {
  if (tiles.length < 3) return null;
  const sites = tiles.map((t) => { const c = polyCentroid(t.poly); return { x: c[0], y: c[1], w: 0, target: t.area, key: t.key }; });
  const cap = () => {
    for (let pass = 0, moved = true; moved && pass < 30; pass++) {
      moved = false;
      for (const a of sites) for (const b of sites) {
        if (a === b) continue;
        const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        if (a.w - b.w > 0.8 * d2) { a.w = b.w + 0.8 * d2; moved = true; }
      }
    }
  };
  let cells;
  for (let iter = 0; iter < rounds; iter++) {
    cap();
    cells = powerCells(sites, region);
    const k = iter < rounds * 0.4 ? 0.3 : 0.05;
    sites.forEach((s, i) => {
      const cell = cells[i];
      if (cell.length < 3) { s.w += 0.5 * s.target; return; }
      s.w += 0.6 * (s.target - polyArea(cell));
      const c = polyCentroid(cell);
      s.x += (c[0] - s.x) * k; s.y += (c[1] - s.y) * k;
    });
  }
  cap();
  cells = powerCells(sites, region);
  const outTiles = [];
  for (let i = 0; i < sites.length; i++) {
    const cell = cells[i];
    if (cell.length < 3) return null;
    const area = polyArea(cell);
    if (Math.abs(area - sites[i].target) > sites[i].target / 3) return null;
    outTiles.push({ key: sites[i].key, poly: cell, area });
  }
  return outTiles;
}

// ---- views ----------------------------------------------------------------------------
// The slices of a view: every field, or one field's parts (plus pieces in it
// that no part claims, when there are any). Each with its items.
export function slicesFor(zoom, pool) {
  if (!zoom) {
    const sweep = (Math.PI * 2) / DOMAINS.length;
    return DOMAINS.map((d, i) => {
      const a0 = -Math.PI / 2 + sweep * i - sweep / 2;
      return { key: d, group: d, first: true, span: { a0, sweep }, domain: d, part: null, label: SHORT[d], a0, sweep, items: pool.filter((it) => it.domain === d) };
    });
  }
  const inField = pool.filter((it) => it.domain === zoom);
  const parts = PARTS[zoom] || [];
  const loose = inField.filter((it) => !parts.includes(it.part));
  const names = loose.length ? [...parts, UNSORTED] : parts;
  const groups = names.map((p) => (p === UNSORTED ? loose : inField.filter((it) => it.part === p)));
  // Inside one field every tile compares exactly: each part's span is as wide
  // as its share of the field's minutes (an empty part keeps a sliver, so its
  // name is still there to tap). A wide span is laid as two or three wedges
  // side by side, so every wedge stays convex (the stone-cutting needs that);
  // a part of one piece can't be split, so it stops just short of half.
  const mins = groups.map((g) => g.reduce((s, it) => s + Math.max(MIN_MINUTES, it.minutes || 0), 0));
  const total = mins.reduce((a, b) => a + b, 0);
  const hi = groups.map((g) => Math.max(WEDGE_MAX, Math.min(1, g.length * WEDGE_MAX)));
  const lo = groups.map((g) => (g.length ? 0.05 : 0.07));
  // Split a part's pieces into n runs of near-even minutes, longest first.
  const binsOf = (g, share) => {
    const n = Math.max(1, Math.min(g.length, Math.ceil(share / WEDGE_MAX - 1e-9)));
    const bins = Array.from({ length: n }, () => ({ items: [], m: 0 }));
    [...g].sort((x, y) => (y.minutes || 0) - (x.minutes || 0) || (x.url < y.url ? -1 : 1)).forEach((it) => {
      const b = bins.reduce((best, bb) => (bb.m < best.m ? bb : best));
      b.items.push(it); b.m += Math.max(MIN_MINUTES, it.minutes || 0);
    });
    return bins;
  };
  const raw = mins.map((m) => (total ? m / total : 1 / names.length));
  let shares, bins;
  for (let attempt = 0; attempt < 6; attempt++) {
    shares = boundedShares(raw, lo, hi);
    bins = groups.map((g, i) => binsOf(g, shares[i]));
    let ok = true;
    bins.forEach((bs, i) => {
      const t = bs.reduce((x, b) => x + b.m, 0) || 1;
      const widest = shares[i] * Math.max(...bs.map((b) => b.m / t));
      if (widest > WEDGE_MAX + 0.03) { hi[i] = Math.max(lo[i], shares[i] * (WEDGE_MAX / widest)); ok = false; }
    });
    if (ok) break;
  }
  let a = -Math.PI / 2 - (shares[0] / bins[0].length) * Math.PI;
  const out = [];
  names.forEach((p, i) => {
    const span = { a0: a, sweep: shares[i] * Math.PI * 2 };
    const label = p === UNSORTED ? 'not sorted' : p;
    const base = { domain: zoom, part: p === UNSORTED ? null : p, unsorted: p === UNSORTED, label, group: `${zoom}/${p}`, span };
    const bs = bins[i], t = bs.reduce((x, b) => x + b.m, 0);
    bs.forEach((b, j) => {
      const sweep = bs.length === 1 ? span.sweep : span.sweep * (b.m / t);
      out.push({ ...base, key: `${zoom}/${p}${j ? `#${j}` : ''}`, first: j === 0, a0: a, sweep, items: b.items });
      a += sweep;
    });
  });
  return out;
}
const WEDGE_MAX = 0.43; // of the circle: well short of a half, so a wedge is convex

// Shares that sum to 1, each held within [lo, hi] (when Σlo ≤ 1 ≤ Σhi). lo
// and hi are numbers or one per share.
export function boundedShares(raw, loIn, hiIn) {
  const n = raw.length;
  const lo = Array.isArray(loIn) ? loIn : raw.map(() => loIn);
  const hi = Array.isArray(hiIn) ? hiIn : raw.map(() => hiIn);
  const sum0 = raw.reduce((a, b) => a + b, 0);
  let v = raw.map((x) => (sum0 > 0 ? x / sum0 : 1 / n));
  for (let pass = 0; pass < 40; pass++) {
    v = v.map((x, i) => Math.min(hi[i], Math.max(lo[i], x)));
    const diff = 1 - v.reduce((a, b) => a + b, 0);
    if (Math.abs(diff) < 1e-9) break;
    const room = v.map((x, i) => (diff > 0 ? hi[i] - x : x - lo[i]));
    const total = room.reduce((a, b) => a + b, 0);
    if (total <= 1e-12) break;
    v = v.map((x, i) => x + diff * (room[i] / total));
  }
  return v;
}

// A slice's stones, cached: the same pieces in the same slice cut the same.
// round: false gives the straight-cracked stones at once (cheap); true the
// rounder ones (a few hundred milliseconds for a crowded field), which the
// Mandala swaps in when it has a moment.
const cut = new Map();
export function sliceSignature(slice) {
  return slice.key + '|' + slice.a0.toFixed(4) + '|' + slice.items.map((it) => `${it.url}:${itemRing(it)}:${Math.round(it.minutes || 0)}`).sort().join(',');
}
export const isCut = (slice, round = true) => cut.has(sliceSignature(slice) + (round ? '' : '|raw'));
export function cutSlice(slice, round = true) {
  const sig = sliceSignature(slice);
  const key = sig + (round ? '' : '|raw');
  if (cut.has(key)) return cut.get(key);
  if (!round && cut.has(sig)) return cut.get(sig);
  const byKey = new Map(slice.items.map((it) => [it.url, it]));
  const tiles = tileSlice(slice.a0, slice.a0 + slice.sweep,
    slice.items.map((it) => ({ key: it.url, ring: itemRing(it), minutes: it.minutes })), hashStr(sig), { round })
    .map((t) => {
      const it = byKey.get(t.key);
      const c = polyCentroid(t.poly);
      const rnd = mulberry32(hashStr(t.key));
      const jit = rnd() * 2 - 1, hueJit = rnd() * 2 - 1, sparkle = rnd() > 0.88 ? rnd() : 0;
      return {
        url: t.key, it, slice: slice.key, group: slice.group || slice.key, poly: t.poly, d: pathOf(t.poly), c,
        ir: Math.max(0, inRadius(t.poly, c) - 1),
        col: tesseraHSL(fieldHue(it.domain), depthT(itemRing(it)), jit, hueJit, sparkle),
      };
    });
  if (cut.size > 400) cut.clear();
  cut.set(key, tiles);
  return tiles;
}

// ---- colour -------------------------------------------------------------------------------
export const fieldHue = (d) => (20 + Math.max(0, DOMAINS.indexOf(d)) * 137.508) % 360;
export const depthT = (r) => 0.08 + r * 0.22;
// The reading mosaic's tessera (ui/mosaic/geometry.js), as parts, so a tile
// outside your lean can be greyed from its own colour.
export function tesseraHSL(hue, t, jitter = 0, hueJit = 0, sparkle = 0) {
  const h = (hue + hueJit * 9 + 360) % 360;
  const warmth = Math.exp(-(((h - 100) / 58) ** 2));
  const spread = 7 + t * 9;
  const s = clamp((20 + t * 46 + jitter * 13) * (1 - 0.3 * warmth), 10, 78);
  const l = clamp(86 - t * 60 + jitter * spread + sparkle * (6 + t * 12) - 9 * warmth * t, 14, 94);
  return { h, s, l };
}
export const hsl = (c) => `hsl(${c.h.toFixed(0)}, ${c.s.toFixed(0)}%, ${c.l.toFixed(0)}%)`;
export const greyed = (c) => `hsl(${c.h.toFixed(0)}, 9%, ${clamp(c.l * 0.25 + 64, 70, 88).toFixed(0)}%)`;
