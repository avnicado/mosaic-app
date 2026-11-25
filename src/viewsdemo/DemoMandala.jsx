// The views mandala for the public /views page: the base of the page. Each
// view is a run of stones in that view's colour, named on the chart. Each ring
// is one of the questions the views split on, numbered from the centre out. A
// stone's shade is that view's answer to that ring's question: solid for the
// first answer, pale for the second, striped for "it depends". Views that look
// alike agree. Tapping a stone opens that ring's question, with the articles on
// each side of it and that view's answer marked; tapping a ring number opens
// the question alone; tapping a view's name opens its case.
//
// Laid like Promenade's Mandala (ui/promenade/tiles.js), where place and size
// mean something:
// - Every ring has the same area, so no question looks smaller for sitting
//   nearer the centre. The rings run from the question the views most share,
//   at the centre, to the one that splits them most sharply, at the rim
//   (engine/viewsDemo.js orders them).
// - A stone's size is how much that question matters to that view's case (the
//   map's stakes, 1 to 3). Every ring holds the same area and every view the
//   same area in all, so no view looks bigger than another overall; within
//   that, a view's stone is bigger on the questions its case turns on.
// - The joints between stones lean a little and step from ring to ring, so it
//   reads as cut stone rather than a pie chart.
//
// Geometry is worked in (angle, u) with u = r^2 / 2, where area is exactly
// d(angle) * du: equal-area rings are equal steps of u, and a straight joint in
// that plane leaves both stones their area.
import React from 'react';

const RIM = 132, HUB = 30, C = 0;
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const at = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
const f = (n) => n.toFixed(2);
const TAU = Math.PI * 2;

function sector(r0, r1, a0, a1) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${f(x0)},${f(y0)} A${r1},${r1} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r0},${r0} 0 ${large} 0 ${f(x3)},${f(y3)} Z`;
}

// Break a short name into at most two lines of about 12 characters.
function lines(name) {
  const words = String(name).split(/\s+/);
  if (name.length <= 12 || words.length < 2) return [name];
  let best = [name], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const w = Math.max(a.length, b.length);
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  return best;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const U0 = (HUB * HUB) / 2, U1 = (RIM * RIM) / 2;
const rOf = (u) => Math.sqrt(2 * u);
const cache = new WeakMap();

// The stones of a map: per ring k and view i, its stones as one path and its
// middle. Kept per map object, so it is worked out once.
//
// Each ring is cut by joints: the ones between views, and inside a long run of
// one view a few more, so the run is laid as several stones the way a mosaic
// is, not one long arc. Joints lean, and the line between two rings wavers a
// little at every corner, so the stones are irregular but still fit exactly.
// A view's area on a ring still follows its stake, apart from that waver.
export function stones(map) {
  if (cache.has(map)) return cache.get(map);
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const du = (U1 - U0) / M;
  const uIn = (k) => U0 + k * du;
  // Each view's share of each ring: its stakes, balanced so every ring is full
  // and every view has the same area in all (iterative proportional fitting).
  const W = views.map((v) => cruxes.map((c) => Math.min(3, Math.max(1, Number(c.stakes?.[v.id]) || 2))));
  for (let it = 0; it < 60; it++) {
    for (let k = 0; k < M; k++) { const t = W.reduce((s, row) => s + row[k], 0); W.forEach((row) => { row[k] /= t; }); }
    W.forEach((row) => { const t = row.reduce((a, b) => a + b, 0); for (let k = 0; k < M; k++) row[k] *= M / N / t; });
  }
  for (let k = 0; k < M; k++) { const t = W.reduce((s, row) => s + row[k], 0); W.forEach((row) => { row[k] /= t; }); }
  // Where each view's run sits on each ring, turned so each view stays as near
  // its usual place (its slice of an even split, view one at the top) as it can.
  const bounds = cruxes.map((_, k) => { const b = [0]; W.forEach((row) => b.push(b[b.length - 1] + row[k] * TAU)); return b; });
  const ideal = views.map((_, i) => -Math.PI / 2 + ((i + 0.5) * TAU) / N);
  const turn = bounds.map((b) => views.reduce((s, _, i) => s + (ideal[i] - (b[i] + b[i + 1]) / 2), 0) / N);
  const rand = rng(hashStr(map.question || views.map((v) => v.id).join('|')));

  // Joints per ring: { a: angle at the ring's middle, lean, view (the stone to
  // its right belongs to it), start (true where a view's run begins) }.
  const joints = cruxes.map((_, k) => {
    const rMid = rOf(uIn(k) + du / 2), thick = rOf(uIn(k + 1)) - rOf(uIn(k));
    const js = [];
    views.forEach((_, i) => {
      const a0 = bounds[k][i] + turn[k], w = bounds[k][i + 1] - bounds[k][i];
      const n = Math.max(1, Math.min(5, Math.round((w * rMid) / (thick * 1.7))));
      for (let j = 0; j < n; j++) {
        const frac = j === 0 ? 0 : (j + (rand() - 0.5) * 0.45) / n;
        js.push({ a: a0 + frac * w, view: i, start: j === 0, width: w / n });
      }
    });
    js.forEach((jt, q) => {
      const prev = js[(q - 1 + js.length) % js.length];
      const narrow = Math.min(jt.width, prev.width);
      jt.lean = (rand() - 0.5) * Math.min(0.5, narrow * 0.6);
    });
    return js;
  });
  // A joint's angle where it meets the ring's inner (side 0) or outer (side 1) line.
  const endA = (jt, side) => jt.a + (side ? jt.lean : -jt.lean) / 2;

  // The line between ring kb-1 and ring kb (kb = 0 the hub, kb = M the rim), as
  // corners { a, u } in order of angle over one turn. Inside lines waver.
  const lines = [];
  for (let kb = 0; kb <= M; kb++) {
    const u = uIn(kb);
    let as = [];
    if (kb > 0) joints[kb - 1].forEach((jt) => as.push(endA(jt, 1)));
    if (kb < M) joints[kb].forEach((jt) => as.push(endA(jt, 0)));
    as = as.map((a) => a - Math.floor((a - as[0]) / TAU) * TAU).sort((x, y) => x - y);
    const step = kb === 0 || kb === M ? 0.06 : 0.32;
    const pts = [];
    as.forEach((a, q) => {
      const next = q + 1 < as.length ? as[q + 1] : as[0] + TAU;
      pts.push(a);
      const n = Math.floor((next - a) / step);
      for (let t = 1; t <= n; t++) pts.push(a + ((next - a) * t) / (n + 1));
    });
    const wav = kb === 0 || kb === M ? 0 : du * 0.16;
    lines.push(pts.map((a) => ({ a, u: u + (rand() - 0.5) * 2 * wav })));
  }
  // u on line kb at angle a (any turn), and the corners strictly between two angles.
  const norm = (line, a) => { const base = line[0].a; return a - Math.floor((a - base) / TAU) * TAU; };
  const uAt = (kb, a) => {
    const line = lines[kb], x = norm(line, a);
    for (let q = 0; q < line.length; q++) {
      const p = line[q], nx = line[q + 1] || { a: line[0].a + TAU, u: line[0].u };
      if (x >= p.a - 1e-9 && x <= nx.a + 1e-9) return nx.a - p.a < 1e-9 ? p.u : p.u + ((nx.u - p.u) * (x - p.a)) / (nx.a - p.a);
    }
    return line[0].u;
  };
  const between = (kb, a0, a1) => {
    const line = lines[kb], out = [];
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    for (const sh of [-TAU, 0, TAU, 2 * TAU]) for (const p of line) { const a = p.a + sh; if (a > lo + 1e-7 && a < hi - 1e-7) out.push({ a, u: p.u }); }
    out.sort((x, y) => x.a - y.a);
    return a1 >= a0 ? out : out.reverse();
  };
  const xy = (a, u) => at(rOf(u), a);
  // Walk along line kb from angle a0 to a1, adding a1 but not a0.
  const along = (kb, a0, a1, pts) => { for (const p of between(kb, a0, a1)) pts.push(xy(p.a, p.u)); pts.push(xy(a1, uAt(kb, a1))); };
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join('') + 'Z';
  // One stone: ring k, from joint q to the next one.
  const stone = (k, q) => {
    const js = joints[k], A = js[q], B = q + 1 < js.length ? js[q + 1] : { ...js[0], a: js[0].a + TAU };
    const pts = [xy(endA(A, 0), uAt(k, endA(A, 0)))];
    pts.push(xy(endA(A, 1), uAt(k + 1, endA(A, 1))));
    along(k + 1, endA(A, 1), endA(B, 1), pts);
    pts.push(xy(endA(B, 0), uAt(k, endA(B, 0))));
    along(k, endA(B, 0), endA(A, 0), pts);
    pts.pop();
    return path(pts);
  };
  const cells = cruxes.map((_, k) => views.map((_, i) => {
    const qs = joints[k].map((jt, q) => (jt.view === i ? q : -1)).filter((q) => q >= 0);
    const um = uIn(k) + du / 2;
    return { d: qs.map((q) => stone(k, q)).join(''), mid: at(rOf(um), bounds[k][i] + turn[k] + (bounds[k][i + 1] - bounds[k][i]) / 2) };
  }));
  // A view's whole run of stones, outlined, for when it is picked.
  const firstOf = (k, i) => joints[k].find((jt) => jt.view === i && jt.start);
  const nextOf = (k, i) => {
    const js = joints[k], q = js.indexOf(firstOf(k, i));
    const after = js.slice(q + 1).find((jt) => jt.start);
    return after || { ...js[0], a: js[0].a + TAU };
  };
  const wrapNear = (a, ref) => a + Math.round((ref - a) / TAU) * TAU;
  const outline = views.map((_, i) => {
    const pts = [];
    let prevOut = null;
    for (let k = 0; k < M; k++) {
      const L = firstOf(k, i);
      const aIn = prevOut == null ? endA(L, 0) : wrapNear(endA(L, 0), prevOut);
      if (prevOut == null) pts.push(xy(aIn, uAt(k, aIn))); else along(k, prevOut, aIn, pts);
      const aOut = aIn + L.lean;
      pts.push(xy(aOut, uAt(k + 1, aOut)));
      prevOut = aOut;
    }
    let R = nextOf(M - 1, i);
    let aR = wrapNear(endA(R, 1), prevOut + (bounds[M - 1][i + 1] - bounds[M - 1][i]));
    along(M, prevOut, aR, pts);
    for (let k = M - 1; k >= 0; k--) {
      R = nextOf(k, i);
      const aOut = k === M - 1 ? aR : wrapNear(endA(R, 1), aR);
      if (k < M - 1) along(k + 1, aR, aOut, pts);
      const aIn = aOut - R.lean;
      pts.push(xy(aIn, uAt(k, aIn)));
      aR = aIn;
    }
    const start = firstOf(0, i);
    along(0, aR, wrapNear(endA(start, 0), aR - (bounds[0][i + 1] - bounds[0][i])), pts);
    pts.pop();
    return path(pts);
  });
  // Where a view's name goes: the middle of its runs, as an angle.
  const labelAngle = views.map((_, i) => cruxes.reduce((s, _c, k) => s + (bounds[k][i] + bounds[k][i + 1]) / 2 + turn[k], 0) / M);
  // Ring numbers sit on the joint nearest the top, so they never cover a colour.
  const numAt = cruxes.map((_, k) => {
    let best = joints[k][0], bestD = Infinity;
    for (const jt of joints[k]) {
      const d = Math.abs(Math.atan2(Math.sin(jt.a + Math.PI / 2), Math.cos(jt.a + Math.PI / 2)));
      if (d < bestD) { bestD = d; best = jt; }
    }
    return at(rOf(uIn(k) + du / 2), best.a);
  });
  const radii = cruxes.map((_, k) => [rOf(uIn(k)), rOf(uIn(k + 1))]);
  const out = { cells, outline, labelAngle, numAt, radii };
  cache.set(map, out);
  return out;
}

// Where a ring's articles pop up from: the middle of a view's stone on that
// ring, or the ring's number when no view is picked. In the chart's own units.
export function anchorPoint(map, viewId, k) {
  const g = stones(map);
  if (!g.cells[k]) return [C, C];
  const i = map.views.findIndex((v) => v.id === viewId);
  return i < 0 ? g.numAt[k] : g.cells[k][i].mid;
}

export const answerText = (c, pos) => (pos === 'left' ? c.left : pos === 'right' ? c.right : 'It depends, or in between');

export default function DemoMandala({ map, focus, onFocus, ring, onRing, onCell, colorOf, mark }) {
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const g = stones(map);
  const pick = (id) => onFocus(focus === id ? null : id);
  const pickRing = (k) => onRing(ring === k ? null : k);
  const keys = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  return (
    <svg className={`vd-mm-svg ${ring != null ? 'ring-on' : ''}`} viewBox="-200 -166 400 332" role="group"
      aria-label={`${N} views, each a slice, across ${M} questions, each a ring`}>
      <defs>
        {views.map((v, i) => (
          <pattern key={v.id} id={`vd-hatch-${i}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={colorOf(map, v.id)} fillOpacity="0.16" />
            <line x1="0" y1="0" x2="0" y2="6" stroke={colorOf(map, v.id)} strokeWidth="2.6" strokeOpacity="0.85" />
          </pattern>
        ))}
      </defs>
      {views.map((v, i) => {
        const col = colorOf(map, v.id);
        const on = focus === v.id, dim = focus && !on;
        return (
          <g key={v.id} className={`vd-mm-slice ${on ? 'on' : ''} ${dim ? 'dim' : ''}`}>
            {cruxes.map((c, k) => {
              const pos = c.positions[v.id] || 'mid';
              const fill = pos === 'mid' ? `url(#vd-hatch-${i})` : col;
              const op = pos === 'left' ? 0.92 : pos === 'right' ? 0.26 : 1;
              return (
                <path key={k} className={`vd-mm-cell ${ring != null && ring !== k ? 'rdim' : ''} ${ring === k && on ? 'here' : ''}`}
                  d={g.cells[k][i].d} fill={fill} fillOpacity={op}
                  role="button" tabIndex={0}
                  aria-label={`${v.name} on question ${k + 1}, ${c.question}: ${answerText(c, pos)}. Open what to read on this question.`}
                  onClick={() => onCell(v.id, k)} onKeyDown={keys(() => onCell(v.id, k))}>
                  <title>{`${v.short || v.name} on question ${k + 1}: ${answerText(c, pos)}`}</title>
                </path>
              );
            })}
            <path className="vd-mm-edge" d={g.outline[i]} style={{ stroke: col }} />
          </g>
        );
      })}
      {ring != null && (
        <path className="vd-mm-ringon" d={sector(g.radii[ring][0], g.radii[ring][1], -90, 269.99)} />
      )}
      <circle className="vd-mm-hub" cx={C} cy={C} r={HUB - 2} />
      <text className="vd-mm-hubt" x={C} y={C - 1}>Tap to</text>
      <text className="vd-mm-hubt" x={C} y={C + 10}>explore</text>
      {cruxes.map((c, k) => {
        const [x, y] = g.numAt[k];
        return (
          <g key={k} className={`vd-mm-num ${ring === k ? 'on' : ''}`} role="button" tabIndex={0}
            aria-pressed={ring === k} aria-label={`Question ${k + 1}: ${c.question}`}
            onClick={() => pickRing(k)} onKeyDown={keys(() => pickRing(k))}>
            <circle cx={x} cy={y} r="9" />
            <text x={x} y={y + 3.6}>{k + 1}</text>
          </g>
        );
      })}
      {mark && (
        <g className="vd-mm-mark" aria-hidden="true">
          <circle className="ping" cx={mark[0]} cy={mark[1]} r="6" />
          <circle className="dot" cx={mark[0]} cy={mark[1]} r="5" />
        </g>
      )}
      {views.map((v, i) => {
        const mid = (g.labelAngle[i] * 180) / Math.PI;
        const [x, y] = pt(RIM + 12, mid);
        const cos = Math.cos(rad(mid)), sin = Math.sin(rad(mid));
        const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
        const ls = lines(v.short || v.name);
        const lh = 17;
        const y0 = sin > 0.2 ? y + 12 : sin < -0.2 ? y - (ls.length - 1) * lh - 3 : y + 5 - ((ls.length - 1) * lh) / 2;
        const on = focus === v.id, dim = focus && !on;
        return (
          <text key={v.id} className={`vd-mm-label ${on ? 'on' : ''} ${dim ? 'dim' : ''}`} x={x} y={y0} textAnchor={anchor}
            style={{ fill: colorOf(map, v.id) }} onClick={() => pick(v.id)} role="button" tabIndex={0}
            aria-label={`${v.name}: its whole case`} onKeyDown={keys(() => pick(v.id))}>
            {ls.map((l, j) => <tspan key={j} x={x} dy={j ? lh : 0}>{l}</tspan>)}
          </text>
        );
      })}
    </svg>
  );
}
