// The Library's reef: the same record as the reading mosaic, drawn as coral.
// One colony per thread. It fills only from real movement; see ./derive.js.
// Private: a mirror, not a trophy. The "outline rule" switch shows what a
// public form would be (structure only, no fill). Nothing is published.
import React, { useEffect, useMemo, useState } from 'react';
import { colonies, rng } from './derive.js';
import { growColony, polypPaths } from './geometry.js';
import { threadPath } from '../router.js';
import './coral.css';

const SLOT_W = 168, ROW_H = 208, BASE_FROM_BOTTOM = 50;
const INK = '#4a4038', PANEL = '#faf6ee';
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmt = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function useNarrow() {
  const q = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

// Two short lines under a colony.
function wrap(text, width = 24, lines = 2) {
  const words = text.split(/\s+/).filter(Boolean), out = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim();
    if (out.length === lines) break;
  }
  if (out.length < lines && line) out.push(line);
  const used = out.join(' ').length;
  if (used < text.trim().length) out[out.length - 1] = out[out.length - 1].replace(/[\s.,;:!?]*$/, '').slice(0, width - 1) + '…';
  return out.slice(0, lines);
}

const words = (c) => {
  const bits = [];
  bits.push(c.real ? `${plural(c.real, 'session')} really moved this question` : 'No session has really moved this question yet');
  if (c.cosmetic) bits.push(`${plural(c.cosmetic, 'session')} only reworded it`);
  if (c.spawned) bits.push(`it gave rise to ${plural(c.spawned, 'thread')}`);
  if (c.reflections) bits.push(`you wrote ${plural(c.reflections, 'note')} on it`);
  return bits.map((b) => b[0].toUpperCase() + b.slice(1)).join('. ') + '.';
};

// Colours from the thread's hue. Quiet threads keep their shapes, bleached.
function palette(h, dorm) {
  if (dorm) return {
    light: `hsl(${h} 12% 93%)`, mid: `hsl(${h} 7% 81%)`, dark: `hsl(${h} 6% 64%)`, edge: `hsl(${h} 6% 52%)`, tip: 'hsl(40 25% 97%)',
    groove: `hsl(${h} 6% 56%)`, tent: `hsl(${h} 10% 94%)`, disc: `hsl(${h} 8% 82%)`, mouth: `hsl(${h} 6% 54%)`, pedge: `hsl(${h} 6% 64%)`,
  };
  return {
    light: `hsl(${h} 64% 82%)`, mid: `hsl(${h} 46% 63%)`, dark: `hsl(${h} 36% 43%)`, edge: `hsl(${h} 38% 31%)`, tip: `hsl(${h} 72% 93%)`,
    groove: `hsl(${h} 40% 33%)`, tent: `hsl(${(h + 16) % 360} 72% 91%)`, disc: `hsl(${h} 56% 73%)`, mouth: `hsl(${h} 44% 27%)`, pedge: `hsl(${h} 40% 42%)`,
  };
}

function Colony({ c, i, geo, outline, selected, onSelect, cx, baseY }) {
  const gray = c.dormant;
  const pal = palette(c.hue, gray);
  const label = wrap(c.question);
  const aria = `${c.question}. ${words(c)}${c.dormant ? ' Quiet for 30 days or more.' : ''}`;
  const key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } };
  const pp = useMemo(() => polypPaths(geo.polyps), [geo]);
  const bodyId = `cr-b${i}`, tubeId = `cr-t${i}`;
  const H = Math.max(geo.height, 12), halfW = Math.max(geo.width / 2, 8);
  const ink = { fill: PANEL, stroke: INK, strokeWidth: 2.2, paintOrder: 'stroke', strokeLinejoin: 'round' };
  const line = { fill: 'none', stroke: INK, strokeWidth: 0.8, strokeOpacity: 0.6, strokeLinecap: 'round' };
  const skin = { fill: `url(#${bodyId})`, stroke: pal.edge, strokeOpacity: gray ? 0.5 : 0.7, strokeWidth: 1.6, paintOrder: 'stroke', strokeLinejoin: 'round' };
  return (
    <g transform={`translate(${cx} ${baseY})`} className={`cr-colony${selected ? ' sel' : ''}${gray ? ' dorm' : ''}`}
      role="button" tabIndex={0} aria-label={aria} aria-pressed={selected} onClick={onSelect} onKeyDown={key}>
      {!outline && (
        <defs>
          {geo.form === 'mound' ? (
            <radialGradient id={bodyId} gradientUnits="userSpaceOnUse" cx={-halfW * 0.35} cy={-H * 0.78} r={Math.max(halfW, H) * 1.35}>
              <stop offset="0" stopColor={pal.light} /><stop offset="0.5" stopColor={pal.mid} /><stop offset="1" stopColor={pal.dark} />
            </radialGradient>
          ) : (
            <linearGradient id={bodyId} gradientUnits="userSpaceOnUse" x1={-halfW * 0.3} y1={-H} x2={halfW * 0.2} y2="4">
              <stop offset="0" stopColor={pal.light} /><stop offset="0.55" stopColor={pal.mid} /><stop offset="1" stopColor={pal.dark} />
            </linearGradient>
          )}
          {geo.form === 'pipes' && (
            <linearGradient id={tubeId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={pal.mid} /><stop offset="0.3" stopColor={pal.light} /><stop offset="0.75" stopColor={pal.mid} /><stop offset="1" stopColor={pal.dark} />
            </linearGradient>
          )}
        </defs>
      )}
      <rect x={-SLOT_W / 2 + 4} y={-ROW_H + BASE_FROM_BOTTOM + 6} width={SLOT_W - 8} height={ROW_H - 12} className="cr-hit" />
      {selected && <ellipse cx="0" cy="6" rx={Math.max(44, geo.rock.half + 24)} ry="15" className="cr-halo" />}
      {!outline && <ellipse cx="2" cy="5" rx={geo.rock.half * 1.15 + 6} ry="6" fill="url(#cr-shadow)" />}

      {geo.membrane && (outline
        ? <path d={geo.membrane} fill="none" stroke={INK} strokeWidth="1" strokeOpacity="0.7" />
        : <path d={geo.membrane} fill={`url(#${bodyId})`} fillOpacity={gray ? 0.45 : 0.5} stroke={pal.edge} strokeOpacity="0.3" strokeWidth="0.8" />)}
      {geo.membrane && !outline && <path d={geo.holes} fill="#f3efe4" fillOpacity="0.55" />}
      {geo.mesh && <path d={geo.mesh} {...(outline ? line : { fill: 'none', stroke: pal.dark, strokeWidth: 0.9, strokeOpacity: 0.75, strokeLinecap: 'round' })} />}

      {geo.plates && <path d={geo.plates} {...(outline ? ink : skin)} />}
      {geo.body && <path d={geo.body} {...(outline ? ink : skin)} />}
      {!outline && geo.body && (
        <>
          <path d={geo.shade} fill={pal.edge} fillOpacity="0.16" />
          <path d={geo.shine} fill="#fff" fillOpacity={gray ? 0.3 : 0.32} />
          {geo.caps && <path d={geo.caps} fill={pal.tip} fillOpacity="0.85" />}
          {geo.pores && <path d={geo.pores} fill={pal.groove} fillOpacity="0.4" />}
        </>
      )}
      {geo.grooves && (outline ? <path d={geo.grooves} {...line} /> : (
        <>
          <path d={geo.grooves} transform="translate(-0.7 -0.9)" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
          <path d={geo.grooves} fill="none" stroke={pal.groove} strokeOpacity="0.6" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ))}

      {geo.tubes.map((t, k) => (
        <g key={`t${k}`}>
          <path d={t.d} {...(outline ? ink : { ...skin, fill: `url(#${tubeId})` })} />
          {!outline && <path d={t.shade} fill={pal.edge} fillOpacity="0.14" />}
          {!outline && <path d={t.shine} fill="#fff" fillOpacity="0.22" />}
          {t.rings && <path d={t.rings} {...(outline ? line : { fill: 'none', stroke: pal.dark, strokeOpacity: 0.45, strokeWidth: 0.8 })} />}
          <path d={t.rim} {...(outline ? { ...line, fill: PANEL, strokeOpacity: 0.9, strokeWidth: 1 } : { fill: pal.light, stroke: pal.edge, strokeOpacity: 0.6, strokeWidth: 0.8 })} />
          <path d={t.hollow} {...(outline ? line : { fill: pal.mouth, fillOpacity: gray ? 0.45 : 0.85 })} />
        </g>
      ))}

      {outline
        ? <path d={geo.rock.d} fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1" />
        : (
          <>
            <path d={geo.rock.d} fill="url(#cr-rock)" stroke="#a9987a" strokeOpacity="0.6" strokeWidth="0.8" />
            <path d={geo.rock.specks} fill="#8f7f62" fillOpacity="0.5" />
          </>
        )}

      {!outline && geo.buds.length > 0 && <path d={geo.buds.map((b) => b.d).join('')} {...skin} />}
      {!outline && geo.polyps.length > 0 && (
        <g opacity={gray ? 0.8 : 1}>
          <path d={pp.tent} fill={pal.tent} stroke={pal.pedge} strokeOpacity="0.55" strokeWidth="0.5" strokeLinejoin="round" />
          <path d={pp.disc} fill={pal.disc} />
          <path d={pp.mouth} fill={pal.mouth} />
        </g>
      )}
      {!outline && geo.pearls.length > 0 && (
        <g>
          <path d={geo.pearls.map((p) => `M${p.x - p.r} ${p.y + p.r * 0.8}a${p.r} ${p.r * 0.35} 0 1 0 ${p.r * 2} 0a${p.r} ${p.r * 0.35} 0 1 0 ${-p.r * 2} 0Z`).join('')} fill="#5a4520" fillOpacity="0.16" />
          {geo.pearls.map((p, k) => <circle key={`q${k}`} cx={p.x} cy={p.y} r={p.r} fill={gray ? 'url(#cr-pearl-dim)' : 'url(#cr-pearl)'} stroke={gray ? '#9d9483' : '#8a6a26'} strokeWidth="0.5" strokeOpacity="0.55" />)}
          <path d={geo.pearls.map((p) => `M${p.x - p.r * 0.62} ${p.y - p.r * 0.32}a${p.r * 0.3} ${p.r * 0.3} 0 1 0 ${p.r * 0.6} 0a${p.r * 0.3} ${p.r * 0.3} 0 1 0 ${-p.r * 0.6} 0Z`).join('')} fill="#fff" fillOpacity="0.85" />
        </g>
      )}
      <text className="cr-label" textAnchor="middle" y="30">
        {label.map((l, k) => <tspan key={k} x="0" dy={k ? 13 : 0}>{l}</tspan>)}
      </text>
    </g>
  );
}

// Shared paint, defined once for the whole reef.
function ReefDefs() {
  return (
    <defs>
      <radialGradient id="cr-shadow"><stop offset="0" stopColor="#5a4428" stopOpacity="0.26" /><stop offset="1" stopColor="#5a4428" stopOpacity="0" /></radialGradient>
      <radialGradient id="cr-pearl" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#fff6dc" /><stop offset="0.35" stopColor="#e8cd86" /><stop offset="0.8" stopColor="#b8923a" /><stop offset="1" stopColor="#8e6c27" /></radialGradient>
      <radialGradient id="cr-pearl-dim" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#fbf8f1" /><stop offset="0.45" stopColor="#ddd5c6" /><stop offset="1" stopColor="#aaa192" /></radialGradient>
      <linearGradient id="cr-rock" x1="0.2" y1="0" x2="0.5" y2="1"><stop offset="0" stopColor="#e4dac6" /><stop offset="0.6" stopColor="#cfc1a5" /><stop offset="1" stopColor="#b9a888" /></linearGradient>
      <linearGradient id="cr-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2d4b8" stopOpacity="0.55" /><stop offset="1" stopColor="#e2d4b8" stopOpacity="0" /></linearGradient>
      <linearGradient id="cr-shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fffdf6" stopOpacity="0.55" /><stop offset="1" stopColor="#fffdf6" stopOpacity="0" /></linearGradient>
    </defs>
  );
}

// A soft band of sand under each row, with a scatter of specks.
function Floor({ y, W, row }) {
  const r = rng(9173 + row * 31);
  let specks = '';
  for (let k = 0; k < W / 14; k++) {
    const x = 6 + r() * (W - 12), yy = y + 6 + r() * 22, s = 0.35 + r() * 0.55;
    specks += `M${(x - s).toFixed(1)} ${yy.toFixed(1)}a${s.toFixed(2)} ${s.toFixed(2)} 0 1 0 ${(2 * s).toFixed(2)} 0a${s.toFixed(2)} ${s.toFixed(2)} 0 1 0 ${(-2 * s).toFixed(2)} 0Z`;
  }
  const wave = `M0 ${y + 4} Q ${W * 0.25} ${y - 3} ${W * 0.5} ${y + 3} T ${W} ${y + 2}`;
  return (
    <g className="cr-ground">
      <path d={`${wave} L ${W} ${y + 46} L 0 ${y + 46} Z`} fill="url(#cr-sand)" />
      <path d={wave} className="cr-floor" />
      <path d={specks} fill="#b5a382" fillOpacity="0.45" />
    </g>
  );
}

export default function CoralReef({ threads, sessions, items }) {
  const narrow = useNarrow();
  const [outline, setOutline] = useState(false);
  const [selId, setSelId] = useState(null);
  const perRow = narrow ? 3 : 6;
  const cols = Math.max(1, Math.ceil(threads.length / Math.ceil(threads.length / perRow))); // balanced rows: 7 threads draw 4 + 3
  const list = useMemo(() => colonies({ threads, sessions, items }), [threads, sessions, items]);
  const geos = useMemo(() => list.map(growColony), [list]);
  const rows = Math.ceil(list.length / cols);
  const W = cols * SLOT_W, Ht = rows * ROW_H + 6;
  const sel = list.find((c) => c.id === selId) || null;
  const anyReal = list.some((c) => c.real > 0);

  return (
    <div className="cr">
      <div className="cr-bar">
        <label className="cr-toggle">
          <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} />
          <span>Preview its public form — the outline rule</span>
        </label>
        {outline && <span className="cr-example">Nothing is published. Structure only, with all fill removed.</span>}
      </div>
      {!anyReal && (
        <p className="cr-empty">Nothing has grown yet. A colony grows only when a session really moves the question. Opening threads, reading and marking add nothing.</p>
      )}
      <div className="cr-wrap">
        <svg className="cr-svg" viewBox={`0 0 ${W} ${Ht}`} role="group" aria-label="Your threads as a reef of coral colonies" onClick={(e) => { if (e.target === e.currentTarget) setSelId(null); }}>
          <ReefDefs />
          {[0.18, 0.47, 0.78].map((u, k) => (
            <path key={`s${k}`} className="cr-shaft" d={`M${W * u} 0 L ${W * u + 46 + k * 12} 0 L ${W * u - 30 + k * 20} ${Ht} L ${W * u - 90 + k * 14} ${Ht} Z`} fill="url(#cr-shaft)" />
          ))}
          {Array.from({ length: rows }, (_, row) => <Floor key={row} row={row} W={W} y={row * ROW_H + ROW_H - BASE_FROM_BOTTOM} />)}
          {list.map((c, i) => {
            const row = Math.floor(i / cols), col = i % cols;
            return (
              <Colony key={c.id} c={c} i={i} geo={geos[i]} outline={outline} selected={sel?.id === c.id}
                onSelect={() => setSelId((cur) => (cur === c.id ? null : c.id))}
                cx={(col + 0.5) * SLOT_W} baseY={row * ROW_H + ROW_H - BASE_FROM_BOTTOM} />
            );
          })}
        </svg>
      </div>

      {sel ? (
        <div className="cr-detail">
          <a className="cr-q" href={'#' + threadPath(sel.id)}>{sel.question}</a>
          <p className="cr-words">{words(sel)}</p>
          <p className="cr-words muted">
            {[sel.closed && 'Closed', sel.dormant && `Quiet since ${fmt(sel.touchedAt)}. That is data, not failure.`].filter(Boolean).join(' · ') || 'Active.'}
          </p>
        </div>
      ) : <p className="cr-hint">Click a colony to read what grew it.</p>}

      <p className="cr-key">
        <b>One colony per thread.</b> A <i className="k-polyp" /> polyp is one session that really moved the question. Branches reach as far as the share of a
        thread’s sessions that really moved it, so rewording adds nothing. Small <i className="k-bud" /> buds at the base are threads it spawned.
        <i className="k-pearl" /> Gold pearls are notes you wrote. Gray and bleached means quiet for 30 days or more: data, not failure.
        Activity alone grows nothing. This is a mirror, not a trophy: only you see it.
      </p>
    </div>
  );
}
