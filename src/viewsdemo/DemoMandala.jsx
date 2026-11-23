// The views mandala for the public /views page. Each slice is one view, in
// that view's colour, named on the chart. Each ring is one of the questions
// the views split on, numbered from the centre out and listed beside the
// chart. A cell's shade is that view's answer to that ring's question:
// solid for the first answer, pale for the second, striped for "it depends".
// Slices that look alike agree. Tapping a slice highlights that view
// everywhere on the page (the same highlight as the tags and buttons).
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

const answerText = (c, pos) => (pos === 'left' ? c.left : pos === 'right' ? c.right : 'It depends, or in between');

export default function DemoMandala({ map, focus, onFocus, colorOf }) {
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const step = 360 / N;
  const ringW = (RIM - HUB) / M;
  const fv = views.find((v) => v.id === focus);
  const toggle = (id) => onFocus(focus === id ? null : id);
  const key = (id) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); } };

  return (
    <section className="vd-block vd-mandala" aria-labelledby="vd-mandala-h">
      <h2 id="vd-mandala-h">The whole debate in one picture</h2>
      <p className="vd-block-sub">
        Each <b>slice</b> is one view. Each <b>ring</b> is one question they split on, numbered from the centre out.
        A <b>solid</b> cell means that view gives the first answer, a <b>pale</b> cell the second, a <b>striped</b> cell “it depends”.
        Slices that look alike agree. Tap a slice to highlight that view.
      </p>
      <div className="vd-mm">
        <svg className="vd-mm-svg" viewBox="-200 -168 400 336" role="group"
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
              <g key={v.id} className={`vd-mm-slice ${on ? 'on' : ''} ${dim ? 'dim' : ''}`} role="button" tabIndex={0}
                aria-pressed={on} aria-label={`${v.name}. ${cruxes.map((c, k) => `Ring ${k + 1}: ${answerText(c, c.positions[v.id])}`).join('. ')}`}
                onClick={() => toggle(v.id)} onKeyDown={key(v.id)}>
                {cruxes.map((c, k) => {
                  const pos = c.positions[v.id] || 'mid';
                  const fill = pos === 'mid' ? `url(#vd-hatch-${i})` : col;
                  const op = pos === 'left' ? 0.92 : pos === 'right' ? 0.17 : 1;
                  return (
                    <path key={k} className="vd-mm-cell" d={sector(HUB + k * ringW, HUB + (k + 1) * ringW, a0, a1)}
                      fill={fill} fillOpacity={op}>
                      <title>{`${v.name}, question ${k + 1}: ${answerText(c, pos)}`}</title>
                    </path>
                  );
                })}
                <path className="vd-mm-edge" d={sector(HUB, RIM, a0, a1)} style={{ stroke: col }} />
              </g>
            );
          })}
          {cruxes.map((_, k) => <circle key={k} className="vd-mm-ring" cx={C} cy={C} r={HUB + (k + 1) * ringW} />)}
          {views.map((_, i) => {
            const a = -90 + i * step;
            const [x0, y0] = pt(HUB, a), [x1, y1] = pt(RIM, a);
            return <line key={i} className="vd-mm-seam" x1={x0} y1={y0} x2={x1} y2={y1} />;
          })}
          <circle className="vd-mm-hub" cx={C} cy={C} r={HUB - 2} />
          <text className="vd-mm-hubt" x={C} y={C + 4}>{N} views</text>
          {cruxes.map((_, k) => {
            const r = HUB + (k + 0.5) * ringW;
            // Ring numbers sit on the seam at the top, so they never cover a cell's colour.
            const [x, y] = pt(r, -90);
            return (
              <g key={k} className="vd-mm-num" aria-hidden="true">
                <circle cx={x} cy={y} r="8.5" />
                <text x={x} y={y + 3.6}>{k + 1}</text>
              </g>
            );
          })}
          {views.map((v, i) => {
            const mid = -90 + (i + 0.5) * step;
            const [x, y] = pt(RIM + 12, mid);
            const cos = Math.cos(rad(mid)), sin = Math.sin(rad(mid));
            const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
            const ls = lines(v.short || v.name);
            const lh = 15;
            const y0 = sin > 0.2 ? y + 11 : sin < -0.2 ? y - (ls.length - 1) * lh - 3 : y + 4 - ((ls.length - 1) * lh) / 2;
            const on = focus === v.id, dim = focus && !on;
            return (
              <text key={v.id} className={`vd-mm-label ${on ? 'on' : ''} ${dim ? 'dim' : ''}`} x={x} y={y0} textAnchor={anchor}
                style={{ fill: colorOf(map, v.id) }} onClick={() => toggle(v.id)}>
                {ls.map((l, j) => <tspan key={j} x={x} dy={j ? lh : 0}>{l}</tspan>)}
              </text>
            );
          })}
        </svg>

        <ol className="vd-mm-key">
          {cruxes.map((c, k) => (
            <li key={k}>
              <p className="vd-mm-q"><span className="vd-split-n">{k + 1}</span>{c.question}</p>
              <p className="vd-mm-ans">
                <span><i className="vd-sw solid" aria-hidden="true" />{c.left}</span>
                <span><i className="vd-sw pale" aria-hidden="true" />{c.right}</span>
              </p>
              {fv && <p className="vd-split-mine" style={{ '--c': colorOf(map, fv.id) }}><b>{fv.name}</b> answers: {answerText(c, c.positions[fv.id])}</p>}
            </li>
          ))}
          <li className="vd-mm-mid"><i className="vd-sw striped" aria-hidden="true" />Striped: it depends, or in between</li>
        </ol>
      </div>
    </section>
  );
}
