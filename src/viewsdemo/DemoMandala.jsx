// The views mandala for the public /views page: the base of the page. Each
// slice is one view, in that view's colour, named on the chart. Each ring is
// one of the questions the views split on, numbered from the centre out. A
// cell's shade is that view's answer to that ring's question: solid for the
// first answer, pale for the second, striped for "it depends". Slices that
// look alike agree. Tapping a cell opens that ring's question, with the
// articles on each side of it and that view's answer marked; tapping a ring
// number opens the question alone; tapping a view's name opens its case.
import React from 'react';

const RIM = 132, HUB = 30, C = 0;
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const f = (n) => n.toFixed(2);

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

// Where a ring's articles pop up from: the middle of a view's cell on that
// ring, or the ring's number when no view is picked. In the chart's own units.
export function anchorPoint(map, viewId, k) {
  const N = map.views.length, M = map.cruxes.length;
  const r = HUB + (k + 0.5) * ((RIM - HUB) / M);
  const i = map.views.findIndex((v) => v.id === viewId);
  return i < 0 ? pt(r, -90) : pt(r, -90 + (i + 0.5) * (360 / N));
}

export const answerText = (c, pos) => (pos === 'left' ? c.left : pos === 'right' ? c.right : 'It depends, or in between');

export default function DemoMandala({ map, focus, onFocus, ring, onRing, onCell, colorOf, mark }) {
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const step = 360 / N;
  const ringW = (RIM - HUB) / M;
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
        const a0 = -90 + i * step, a1 = a0 + step;
        const col = colorOf(map, v.id);
        const on = focus === v.id, dim = focus && !on;
        return (
          <g key={v.id} className={`vd-mm-slice ${on ? 'on' : ''} ${dim ? 'dim' : ''}`}>
            {cruxes.map((c, k) => {
              const pos = c.positions[v.id] || 'mid';
              const fill = pos === 'mid' ? `url(#vd-hatch-${i})` : col;
              const op = pos === 'left' ? 0.92 : pos === 'right' ? 0.17 : 1;
              return (
                <path key={k} className={`vd-mm-cell ${ring != null && ring !== k ? 'rdim' : ''} ${ring === k && on ? 'here' : ''}`}
                  d={sector(HUB + k * ringW, HUB + (k + 1) * ringW, a0, a1)} fill={fill} fillOpacity={op}
                  role="button" tabIndex={0}
                  aria-label={`${v.name} on question ${k + 1}, ${c.question}: ${answerText(c, pos)}. Open what to read on this question.`}
                  onClick={() => onCell(v.id, k)} onKeyDown={keys(() => onCell(v.id, k))}>
                  <title>{`${v.short || v.name} on question ${k + 1}: ${answerText(c, pos)}`}</title>
                </path>
              );
            })}
            <path className="vd-mm-edge" d={sector(HUB, RIM, a0, a1)} style={{ stroke: col }} />
          </g>
        );
      })}
      {cruxes.map((_, k) => <circle key={k} className="vd-mm-ring" cx={C} cy={C} r={HUB + (k + 1) * ringW} />)}
      {ring != null && (
        <path className="vd-mm-ringon" d={sector(HUB + ring * ringW, HUB + (ring + 1) * ringW, -90, 269.99)} />
      )}
      {views.map((_, i) => {
        const a = -90 + i * step;
        const [x0, y0] = pt(HUB, a), [x1, y1] = pt(RIM, a);
        return <line key={i} className="vd-mm-seam" x1={x0} y1={y0} x2={x1} y2={y1} />;
      })}
      <circle className="vd-mm-hub" cx={C} cy={C} r={HUB - 2} />
      <text className="vd-mm-hubt" x={C} y={C - 1}>Tap to</text>
      <text className="vd-mm-hubt" x={C} y={C + 10}>explore</text>
      {cruxes.map((c, k) => {
        const r = HUB + (k + 0.5) * ringW;
        // Ring numbers sit on the seam at the top, so they never cover a cell's colour.
        const [x, y] = pt(r, -90);
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
        const mid = -90 + (i + 0.5) * step;
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
