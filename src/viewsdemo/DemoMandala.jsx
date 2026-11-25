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

// The stones of a map: per ring k and view i, its outline, its middle and the
// angle of each joint. Kept per map object, so it is worked out once.
export function stones(map) {
  if (cache.has(map)) return cache.get(map);
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const du = (U1 - U0) / M;
  // Each view's share of each ring: its stakes, balanced so every ring is full
  // and every view has the same area in all (iterative proportional fitting).
  const W = views.map((v) => cruxes.map((c) => Math.min(3, Math.max(1, Number(c.stakes?.[v.id]) || 2))));
  for (let it = 0; it < 60; it++) {
    for (let k = 0; k < M; k++) { const t = W.reduce((s, row) => s + row[k], 0); W.forEach((row) => { row[k] /= t; }); }
    W.forEach((row) => { const t = row.reduce((a, b) => a + b, 0); for (let k = 0; k < M; k++) row[k] *= M / N / t; });
  }
  for (let k = 0; k < M; k++) { const t = W.reduce((s, row) => s + row[k], 0); W.forEach((row) => { row[k] /= t; }); }
  // Joints at each ring, turned so each view's stones sit as near their usual
  // place (its slice of an even split, view one at the top) as they can.
  const bounds = cruxes.map((_, k) => { const b = [0]; W.forEach((row) => b.push(b[b.length - 1] + row[k] * TAU)); return b; });
  const ideal = views.map((_, i) => -Math.PI / 2 + ((i + 0.5) * TAU) / N);
  const turn = bounds.map((b) => views.reduce((s, _, i) => s + (ideal[i] - (b[i] + b[i + 1]) / 2), 0) / N);
  // Each joint leans a little, the same way for the same map every time.
  const rand = rng(hashStr(map.question || views.map((v) => v.id).join('|')));
  const lean = bounds.map((b) => views.map((_, j) => {
    const narrow = Math.min(b[j + 1] - b[j], j ? b[j] - b[j - 1] : b[N] - b[N - 1]);
    return (rand() - 0.5) * Math.min(0.16, narrow * 0.5);
  }));
  const joint = (k, j, u) => bounds[k][j] + turn[k] + lean[k][j % N] * ((u - (U0 + (k + 0.5) * du)) / (du / 2));
  const uIn = (k) => U0 + k * du;
  // Walks, as points: up or down a joint, and along a ring's edge.
  const alongJoint = (k, j, ua, ub, pts) => { for (let t = 0; t <= 4; t++) { const u = ua + ((ub - ua) * t) / 4; pts.push(at(rOf(u), joint(k, j, u))); } };
  const alongRing = (u, a0, a1, pts) => { const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * rOf(u)) / 5)); for (let t = 1; t < n; t++) pts.push(at(rOf(u), a0 + ((a1 - a0) * t) / n)); };
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join('') + 'Z';

  const cells = cruxes.map((_, k) => views.map((v, i) => {
    const ua = uIn(k), ub = uIn(k + 1), pts = [];
    alongJoint(k, i, ua, ub, pts);
    alongRing(ub, joint(k, i, ub), joint(k, i + 1, ub), pts);
    alongJoint(k, i + 1, ub, ua, pts);
    alongRing(ua, joint(k, i + 1, ua), joint(k, i, ua), pts);
    const um = ua + du / 2;
    return { d: path(pts), mid: at(rOf(um), (joint(k, i, um) + joint(k, i + 1, um)) / 2) };
  }));
  // A view's whole run of stones, outlined, for when it is picked.
  const outline = views.map((_, i) => {
    const pts = [];
    for (let k = 0; k < M; k++) {
      alongJoint(k, i, uIn(k), uIn(k + 1), pts);
      if (k < M - 1) alongRing(uIn(k + 1), joint(k, i, uIn(k + 1)), joint(k + 1, i, uIn(k + 1)), pts);
    }
    alongRing(U1, joint(M - 1, i, U1), joint(M - 1, i + 1, U1), pts);
    for (let k = M - 1; k >= 0; k--) {
      alongJoint(k, i + 1, uIn(k + 1), uIn(k), pts);
      if (k > 0) alongRing(uIn(k), joint(k, i + 1, uIn(k)), joint(k - 1, i + 1, uIn(k)), pts);
    }
    alongRing(U0, joint(0, i + 1, U0), joint(0, i, U0), pts);
    return path(pts);
  });
  // Where a view's name goes: the middle of its stones, as an angle.
  const labelAngle = views.map((_, i) => cruxes.reduce((s, _c, k) => s + (bounds[k][i] + bounds[k][i + 1]) / 2 + turn[k], 0) / M);
  // Ring numbers sit on the joint nearest the top, so they never cover a colour.
  const numAt = cruxes.map((_, k) => {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < N; j++) {
      const a = joint(k, j, uIn(k) + du / 2);
      const d = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      if (d < bestD) { bestD = d; best = j; }
    }
    return at(rOf(uIn(k) + du / 2), joint(k, best, uIn(k) + du / 2));
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
