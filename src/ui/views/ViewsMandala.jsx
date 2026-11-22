// The views mandala (admin only for now). Each slice is a view, each ring a
// crux (the first crux at the centre, the last at the rim), and each cell is
// coloured by how that view answers that crux: the first answer, the second,
// or in between. Views that answer alike look alike, so overlaps show without
// lines. A dashed outline marks a view the question's wording leans away
// from. The names sit in a row of numbered chips under the mandala, so they
// stay readable on a phone. Tap a slice, or its chip, to read its answers, the view it's
// closest to, what would change its mind and a piece by someone who holds it.
import React, { useMemo, useState } from 'react';
import { closestOf, leanAgainst, hostOf } from '../../engine/views.js';
import './views.css';

const SIZE = 400, C = SIZE / 2, HUB = 44, RIM = 150, VB = RIM + 30;
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const f = (n) => n.toFixed(2);

function sector(r0, r1, a0, a1) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${f(x0)},${f(y0)} A${r1},${r1} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${r0},${r0} 0 ${large} 0 ${f(x3)},${f(y3)} Z`;
}

const ANSWER_WORD = { a: 'first answer', b: 'second answer', mid: 'in between' };
const answerText = (crux, a) => (a === 'a' ? crux.a : a === 'b' ? crux.b : 'In between, or it depends');

export default function ViewsMandala({ map }) {
  const [sel, setSel] = useState(0);
  const { views, cruxes } = map;
  const N = views.length, M = cruxes.length;
  const step = 360 / N;
  const ringW = (RIM - HUB) / M;
  const lean = useMemo(() => views.map((_, i) => leanAgainst(map, i)), [map]);
  const hasLean = (map.lean || []).some(Boolean);
  const v = views[Math.min(sel, N - 1)];
  const close = closestOf(map, Math.min(sel, N - 1));
  const vLean = lean[Math.min(sel, N - 1)];

  const pick = (i) => setSel(i);
  const key = (i) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick((i + 1) % N); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick((i + N - 1) % N); }
  };

  return (
    <div className="vm">
      <div className="vm-stage">
        <svg className="vm-svg" viewBox={`${C - VB} ${C - VB} ${2 * VB} ${2 * VB}`}
          role="group" aria-label={`${N} views on ${M} cruxes`}>
          <circle className="vm-ground" cx={C} cy={C} r={RIM} />
          {views.map((view, i) => {
            const a0 = -90 + i * step, a1 = a0 + step;
            const on = i === sel;
            return (
              <g key={i} className={`vm-slice ${on ? 'on' : ''}`} role="button" tabIndex={0}
                aria-pressed={on} aria-label={`${view.name}${lean[i].away ? ', your question leans away from this view' : ''}`}
                onClick={() => pick(i)} onKeyDown={key(i)}>
                {cruxes.map((crux, k) => (
                  <path key={k} className={`vm-cell ans-${view.answers[k]}`} d={sector(HUB + k * ringW, HUB + (k + 1) * ringW, a0, a1)}>
                    <title>{`${view.name} · ${crux.label}: ${answerText(crux, view.answers[k])}`}</title>
                  </path>
                ))}
                {lean[i].away && <path className="vm-away" d={sector(HUB + 3, RIM - 3, a0 + 1.4, a1 - 1.4)} />}
              </g>
            );
          })}
          {views.map((_, i) => {
            const a0 = -90 + i * step;
            const [x0, y0] = pt(HUB, a0), [x1, y1] = pt(RIM, a0);
            return <line key={i} className="vm-seam" x1={x0} y1={y0} x2={x1} y2={y1} />;
          })}
          <path className="vm-sel" d={sector(HUB, RIM, -90 + sel * step, -90 + (sel + 1) * step)} />
          {cruxes.map((_, k) => (
            <text key={k} className="vm-ring-n" x={C + 4} y={C - (HUB + (k + 0.5) * ringW)} >{k + 1}</text>
          ))}
          <g className="vm-hub">
            <circle cx={C} cy={C} r={HUB - 4} />
            <text x={C} y={C - 6}>{N} views</text>
            <text x={C} y={C + 8}>{M} cruxes</text>
          </g>
          {views.map((view, i) => {
            const [bx, by] = pt(RIM + 16, -90 + (i + 0.5) * step);
            return (
              <g key={i} className={`vm-label ${i === sel ? 'on' : ''}`} onClick={() => pick(i)}>
                <circle cx={bx} cy={by} r={10} />
                <text className="vm-badge" x={bx} y={by}>{i + 1}</text>
              </g>
            );
          })}
        </svg>
        <div className="vm-picker" role="tablist" aria-label="Views">
          {views.map((view, i) => (
            <button key={i} role="tab" aria-selected={i === sel} className={`vm-pick ${i === sel ? 'on' : ''} ${lean[i].away ? 'away' : ''}`} onClick={() => pick(i)}>
              <span className="vm-pick-n">{i + 1}</span>{view.name}
            </button>
          ))}
        </div>
      </div>

      <div className="vm-side">
        <ol className="vm-cruxes">
          {cruxes.map((c, k) => (
            <li key={k}>
              <div className="vm-crux-head"><span className="vm-ring-tag">ring {k + 1}</span><span className="vm-kind">{c.kind}</span></div>
              <div className="vm-crux-q">{c.question}</div>
              <div className="vm-crux-ans">
                <span><i className="vm-dot ans-a" />{c.a}</span>
                <span><i className="vm-dot ans-b" />{c.b}</span>
              </div>
              {map.lean?.[k] && <div className="vm-crux-lean">Your question assumes: {map.lean[k] === 'a' ? c.a : c.b}</div>}
            </li>
          ))}
        </ol>
        <p className="vm-key"><i className="vm-dot ans-mid" />in between or “it depends” · rings run from the centre out</p>
      </div>

      {v && (
        <section className="vm-detail" aria-live="polite">
          <div className="vm-detail-head">
            <span className="vm-pick-n big">{sel + 1}</span>
            <h3>{v.name}</h3>
          </div>
          {v.summary && <p className="vm-summary">{v.summary}</p>}
          <ul className="vm-answers">
            {cruxes.map((c, k) => (
              <li key={k}>
                <i className={`vm-dot ans-${v.answers[k]}`} title={ANSWER_WORD[v.answers[k]]} />
                <span className="vm-a-label">{c.label}</span>
                <span className="vm-a-text">{answerText(c, v.answers[k])}</span>
              </li>
            ))}
          </ul>
          <div className="vm-facts">
            {close && <p><span className="label">Closest to</span> {views[close.index].name}, agreeing on {close.same} of {M}.</p>}
            {vLean.away && <p className="vm-awaynote"><span className="label">Your question</span> leans away from this view: it answers {vLean.against} of the {vLean.assumed} {vLean.assumed === 1 ? 'crux' : 'cruxes'} your wording assumes the other way.</p>}
            {!vLean.away && hasLean && vLean.against === 0 && <p className="muted vm-small">Your question’s wording sits with this view.</p>}
            {v.changeMind && <p><span className="label">What would change its mind</span> {v.changeMind}</p>}
          </div>
          {v.piece ? (
            <a className="vm-piece" href={v.piece.url} target="_blank" rel="noopener noreferrer">
              <span className="label">Read someone who holds it</span>
              <span className="vm-piece-title">{v.piece.title}</span>
              <span className="vm-piece-src">{[v.piece.by, v.piece.source || hostOf(v.piece.url)].filter(Boolean).join(' · ')}</span>
            </a>
          ) : (
            <p className="muted vm-small">No piece found by someone who argues this view.</p>
          )}
        </section>
      )}
    </div>
  );
}
