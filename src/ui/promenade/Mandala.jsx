// The Mandala is where you lean. One radial chart: fields as wedges, density
// as rings (centre = shallow, edge = substantive — scoring.js's densityRing(),
// not length or difficulty). Tap a cell to lean into a field at a depth (up to
// three fields); tap it again to let go. A field opens into its own Mandala of
// four parts, with the same rings and a trail back out. The centre leaves it
// open. Every step is optional: with nothing chosen the shelf below spreads
// across every field. Each item is a dot coloured by its move; the shelf's
// cards are numbered on their dots. Filled cells are what you've held.
// See mandala.js for placement and scoring.js's composeLeanShelf for the shelf.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PARTS, emptyLean, hunchStems, nearHunch, inLeanArea, inLeanBand, leanParts, itemRing } from '../../scoring.js';
import {
  SIZE, C, INNER, MAX_R, RT, DENSITY_RING_COUNT, RING_BLURB,
  polar, wedgePath, arcPath, viewGeometry, layoutDots, admittedOf,
} from './mandala.js';
import './mandala.css';

export const MOVES = {
  sharpen: { ask: 'Go deeper', phrase: 'going deeper', why: 'it cuts closer to a frame' },
  complicate: { ask: 'Push back on me', phrase: 'pushing back', why: 'it resists the easy framing' },
  bridge: { ask: 'Surprise me from elsewhere', phrase: 'with a surprise from elsewhere', why: 'same shape, different field' },
  ground: { ask: 'Something concrete', phrase: 'kept concrete', why: 'a specific, concrete case' },
};
const HUNCH_EXAMPLES = ['something about cities', 'how things wear out', 'maps', 'time'];
const METER_CAPTION = [
  'Wide open. A good way to start when you’re not sure.',
  'A light lean.',
  'Leaning some.',
  'Leaning in.',
  'As focused as it gets, short of a question.',
];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// On a phone the Mandala runs edge to edge and its labels follow the rim, so
// the chart can fill the width instead of leaving room for flat labels at the
// sides. Desktop keeps the flat labels.
const PHONE = '(max-width: 600px)';
function usePhone() {
  const query = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE).matches;
  const [phone, setPhone] = useState(query);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return undefined;
    const m = matchMedia(PHONE);
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return phone;
}
// The rim band that holds a phone's labels (and is their tap target).
const PHONE_HALF = MAX_R + 42, RIM_IN = MAX_R + 3, RIM_OUT = PHONE_HALF - 1;

export const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

// ---- lean edits (pure) --------------------------------------------------------------
function addField(lean, d) {
  if (lean.fields.includes(d)) return lean;
  const fields = [...lean.fields, d];
  const parts = { ...lean.parts };
  if (fields.length > 3) delete parts[fields.shift()];
  return { ...lean, fields, parts };
}
export function removeField(lean, d) {
  const parts = { ...lean.parts }; delete parts[d];
  return { ...lean, fields: lean.fields.filter((x) => x !== d), parts };
}
function togglePart(lean, d, p) {
  const cur = leanParts(lean, d);
  let next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
  if (next.length === PARTS[d].length) next = []; // all four parts is the whole field
  const parts = { ...lean.parts };
  if (next.length) parts[d] = next; else delete parts[d];
  return { ...lean, parts };
}

export function leanStatement(lean) {
  const fieldText = (d) => (leanParts(lean, d).length ? `${d} (${andList(leanParts(lean, d))})` : d);
  const where = lean.fields.length ? cap(andList(lean.fields.map(fieldText))) : 'Anywhere on the Mandala';
  const bits = [where, lean.ring == null ? 'any depth' : RING_BLURB[lean.ring]];
  if (lean.mood) bits.push(MOVES[lean.mood].phrase);
  return bits.join(', ');
}

export default function Mandala({ items, lean, setLean, held, numbered, hot, setHot }) {
  const phone = usePhone();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [zoom, setZoom] = useState(null);
  const [anim, setAnim] = useState('');
  const [hunchText, setHunchText] = useState(lean.hunch || '');
  const hunchTimer = useRef(null);
  useEffect(() => { if ((lean.hunch || '') !== hunchText.trim()) setHunchText(lean.hunch || ''); }, [lean.hunch]); // eslint-disable-line react-hooks/exhaustive-deps
  // A field that leaves the lean can't stay open.
  useEffect(() => { if (zoom && !lean.fields.includes(zoom)) setZoom(null); }, [lean.fields, zoom]);

  const pool = useMemo(() => admittedOf(items), [items]);
  const geo = useMemo(() => viewGeometry(zoom, phone), [zoom, phone]);
  const { pos, dotR } = useMemo(() => layoutDots(pool, geo, zoom), [pool, geo, zoom]);
  const stems = useMemo(() => hunchStems(lean.hunch), [lean.hunch]);
  const heldUrls = useMemo(() => new Set(held.map((h) => h.url)), [held]);
  const numOf = useMemo(() => new Map(numbered.map((n) => [n.url, n.num])), [numbered]);

  const go = (cls, z) => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setAnim(reduce ? '' : cls);
    setZoom(z);
  };
  const zoomIn = (d) => { setLean((l) => addField(l, d)); go('zooming', d); };
  const zoomOut = () => go('unzooming', null);
  const leaveOpen = () => { setLean(emptyLean()); setHunchText(''); };

  const tapCell = (s, r) => setLean((l) => {
    if (s.part === null) {
      if (l.fields.includes(s.domain) && l.ring === r) return removeField(l, s.domain);
      return { ...addField(l, s.domain), ring: r };
    }
    let next = addField(l, s.domain);
    const on = leanParts(next, s.domain).includes(s.part);
    if (on && next.ring === r) return togglePart(next, s.domain, s.part);
    if (!on) next = togglePart(next, s.domain, s.part);
    return { ...next, ring: r };
  });
  const tapLabel = (s) => setLean((l) => {
    if (s.part === null) return l.fields.includes(s.domain) ? removeField(l, s.domain) : addField(l, s.domain);
    return togglePart(addField(l, s.domain), s.domain, s.part);
  });
  const onKey = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

  const setHunch = (v) => {
    setHunchText(v);
    clearTimeout(hunchTimer.current);
    hunchTimer.current = setTimeout(() => setLean((l) => ({ ...l, hunch: v.trim().slice(0, 80) })), 250);
  };

  const anyLean = lean.fields.length > 0 || lean.ring != null;
  const inField = (d) => !lean.fields.length || lean.fields.includes(d);
  const inPart = (d, p) => !leanParts(lean, d).length || leanParts(lean, d).includes(p);

  const area = pool.filter((it) => inLeanArea(it, lean) && !heldUrls.has(it.url));
  const nearCount = stems.length ? area.filter((it) => nearHunch(it, stems)).length : 0;
  const unsorted = zoom ? pool.filter((it) => it.domain === zoom && !it.part).length : 0;
  const meterSteps = [lean.fields.length > 0, lean.fields.some((d) => leanParts(lean, d).length), lean.ring != null || !!lean.mood, !!(lean.hunch || '').trim()];
  const meterN = meterSteps.filter(Boolean).length;
  const picksOutsideZoom = zoom ? numbered.filter((n) => n.domain !== zoom).length : 0;

  return (
    <section className="ln" aria-label="Your lean">
      <div className="ln-mandala">
        <nav className="ln-crumbs" aria-label="Where you are on the Mandala">
          {zoom ? (
            <>
              <button type="button" onClick={zoomOut}>All fields</button>
              <span className="sep" aria-hidden>›</span>
              <span className="here">{zoom}</span>
            </>
          ) : <span className="here">All fields</span>}
        </nav>

        <svg
          key={zoom || 'all'}
          className={`ln-svg ${zoom ? 'zoomed' : ''} ${phone ? 'phone' : ''} ${anim}`}
          viewBox={phone ? `${C - PHONE_HALF} ${C - PHONE_HALF} ${PHONE_HALF * 2} ${PHONE_HALF * 2}` : `0 0 ${SIZE} ${SIZE}`}
          role="group"
          aria-label={zoom ? `Inside ${zoom}: four parts by five depths` : 'Mandala: twelve fields by five depths'}
        >
          <g>
            {geo.slices.map((s, i) => {
              const a0 = geo.a0Of(i), a1 = a0 + geo.sweep - 0.008;
              return Array.from({ length: DENSITY_RING_COUNT }, (_, r) => {
                const field = lean.fields.includes(s.domain) && (s.part === null || inPart(s.domain, s.part));
                const lit = anyLean && inField(s.domain) && (s.part === null || inPart(s.domain, s.part)) && inLeanBand(lean, r);
                const cls = ['ln-cell', field && 'field', lit && 'band', lit && lean.ring === r && 'target'].filter(Boolean).join(' ');
                return (
                  <path key={`${i}-${r}`} d={wedgePath(INNER + RT * r, INNER + RT * (r + 1), a0, a1)} className={cls} onClick={() => tapCell(s, r)}>
                    <title>{`${s.part ? `${s.domain} · ${s.part}` : s.domain} · ${RING_BLURB[r]}`}</title>
                  </path>
                );
              });
            })}
          </g>
          <g>
            {held.map((h) => {
              const si = geo.indexOf(h);
              if (si < 0) return null;
              const a0 = geo.a0Of(si);
              return <path key={h.url} d={wedgePath(INNER + RT * h.ring, INNER + RT * (h.ring + 1), a0, a0 + geo.sweep - 0.008)} className="ln-held" />;
            })}
          </g>
          <g>
            {Array.from({ length: DENSITY_RING_COUNT }, (_, i) => (
              <circle key={i} cx={C} cy={C} r={INNER + RT * (i + 1)} className="ln-grid" />
            ))}
          </g>
          <g>
            {geo.slices.map((s, i) => {
              const a0 = geo.a0Of(i), a1 = a0 + geo.sweep - 0.008;
              const mid = (a0 + a1) / 2;
              const on = s.part === null ? lean.fields.includes(s.domain) : leanParts(lean, s.domain).includes(s.part);
              const np = s.part === null ? leanParts(lean, s.domain).length : 0;
              const words = <>{s.label}{np ? <tspan className="n">{phone ? '›' : ' ›'}{np}</tspan> : null}</>;
              const g = (body) => (
                <g key={s.label} tabIndex={0} role="button" aria-pressed={on}
                  aria-label={s.part === null ? `${s.domain}${np ? `, ${np} parts chosen` : ''}` : `${s.part}, part of ${s.domain}`}
                  onClick={() => tapLabel(s)} onKeyDown={onKey(() => tapLabel(s))} className="ln-label-g">{body}</g>
              );
              if (phone) {
                // Text follows the rim, upright on both halves: the lower half
                // runs the arc backwards and sits its baseline further out.
                const lower = Math.sin(mid) > 0.05;
                const id = `${uid}-rim-${i}`;
                return g(<>
                  <path d={wedgePath(RIM_IN, RIM_OUT, a0, a1)} className="ln-label-hit" />
                  <path id={id} d={lower ? arcPath(MAX_R + 28, a1, a0) : arcPath(MAX_R + 15, a0, a1)} className="ln-rim-path" />
                  <text className={`ln-label ${on ? 'on' : ''}`}>
                    <textPath href={`#${id}`} xlinkHref={`#${id}`} startOffset="50%" textAnchor="middle">{words}</textPath>
                  </text>
                </>);
              }
              const [lx, ly] = polar(MAX_R + 18, mid);
              const anchor = Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle';
              const w = (s.label.length + 3) * (zoom ? 8 : 7.2) + 10;
              const bx = anchor === 'start' ? lx - 5 : anchor === 'end' ? lx - w + 5 : lx - w / 2;
              return g(<>
                <rect x={bx} y={ly - 11} width={w} height={22} rx={3} className="ln-label-hit" />
                <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className={`ln-label ${on ? 'on' : ''}`}>{words}</text>
              </>);
            })}
          </g>
          <g>
            {pool.map((it) => {
              const p = pos.get(it.url);
              if (!p) return null;
              const num = numOf.get(it.url);
              const on = (inLeanArea(it, lean) || num) && !heldUrls.has(it.url);
              const near = on && nearHunch(it, stems);
              return (
                <g key={it.url}>
                  {near && <circle cx={p.x} cy={p.y} r={dotR + 3.5} className="ln-halo" />}
                  <circle cx={p.x} cy={p.y} r={dotR} className={`ln-dot ${it.slot} ${on ? 'in' : ''} ${hot === it.url ? 'hot' : ''}`}
                    onClick={() => tapCell(geo.slices[p.si], p.r)}
                    onMouseEnter={() => num && setHot(it.url)} onMouseLeave={() => setHot(null)}>
                    <title>{`${it.title} (${it.domain}${it.part ? ` · ${it.part}` : ''} · ${RING_BLURB[itemRing(it)]})`}</title>
                  </circle>
                </g>
              );
            })}
          </g>
          <circle cx={C} cy={C} r={INNER - 4} className="ln-home" tabIndex={0} role="button"
            aria-label={zoom ? 'Back to all fields' : 'Leave it open'}
            onClick={zoom ? zoomOut : leaveOpen} onKeyDown={onKey(zoom ? zoomOut : leaveOpen)} />
          <text x={C} y={C + 1} dominantBaseline="middle" className="ln-home-label">{zoom ? 'back' : 'open'}</text>
          <g>
            {numbered.map((n) => {
              const p = pos.get(n.url);
              if (!p) return null;
              return (
                <g key={n.url} className={`ln-pick ${hot === n.url ? 'hot' : ''}`}>
                  <circle cx={p.x} cy={p.y} r={phone ? (zoom ? 12 : 10.5) : zoom ? 10 : 8.5} />
                  <text x={p.x} y={p.y}>{n.num}</text>
                </g>
              );
            })}
          </g>
        </svg>

        <p className="ln-hint">
          {!zoom
            ? 'Tap a cell to lean into a field at a depth (up to three fields). Tap it again to let go. The centre leaves it open.'
            : leanParts(lean, zoom).length
              ? `Leaning into ${andList(leanParts(lean, zoom))}. Tap a part again to let it go. The centre takes you back out.`
              : `All of ${zoom} is in your lean. Tap a part to narrow it further, or don’t. The centre takes you back out.`}
          {zoom && unsorted > 0 && ` ${unsorted} ${unsorted === 1 ? 'item' : 'items'} in ${zoom} today ${unsorted === 1 ? 'isn’t' : 'aren’t'} sorted into a part, so ${unsorted === 1 ? 'it shows' : 'they show'} only when you lean on the whole field.`}
        </p>
        <div className="ln-go">
          {!zoom && lean.fields.length > 0 && (
            <>
              <span>Go further into</span>
              {lean.fields.map((d) => <button key={d} type="button" className="ln-chip go" onClick={() => zoomIn(d)}>{d}</button>)}
              <span className="muted">or don’t: the shelf is ready as it is.</span>
            </>
          )}
          {!zoom && !lean.fields.length && (
            <span className="muted">Nothing chosen, so the shelf below spreads across every field. Pick a wedge whenever something tugs.</span>
          )}
          {zoom && lean.fields.filter((d) => d !== zoom).length > 0 && (
            <>
              <span>Step into</span>
              {lean.fields.filter((d) => d !== zoom).map((d) => <button key={d} type="button" className="ln-chip go" onClick={() => go('zooming', d)}>{d}</button>)}
            </>
          )}
          {zoom && picksOutsideZoom > 0 && <span className="muted">{picksOutsideZoom} of the shelf’s picks sit outside this field.</span>}
        </div>
      </div>

      <div className="ln-panel">
        <div className="ln-now">
          <div className="label">Your lean</div>
          <p className="ln-statement">
            {leanStatement(lean)}
            {(lean.hunch || '').trim() && <>, leaning toward <em>“{lean.hunch.trim()}”</em></>}.
          </p>
          <div className="ln-meter" aria-hidden>{meterSteps.map((on, i) => <span key={i} className={on ? 'on' : ''} />)}</div>
          <p className="ln-meter-cap">{METER_CAPTION[meterN]}</p>
        </div>

        <div className="ln-ctl">
          <div className="label">Fields</div>
          <div className="ln-row">
            {!lean.fields.length && <span className="muted ln-small">Open: all twelve fields.</span>}
            {lean.fields.map((d) => {
              const ps = leanParts(lean, d);
              return (
                <span key={d} className="ln-fchip">
                  <button type="button" className="name" title="Go further in" onClick={() => zoomIn(d)}>
                    {d}{ps.length ? <small> › {ps.join(', ')}</small> : null}
                  </button>
                  <button type="button" className="x" aria-label={`Remove ${d}`} onClick={() => setLean((l) => removeField(l, d))}>×</button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="ln-ctl">
          <div className="label">Depth</div>
          <div className="ln-row">
            <button type="button" className="ln-chip" aria-pressed={lean.ring == null} onClick={() => setLean((l) => ({ ...l, ring: null }))}>Any depth</button>
            {RING_BLURB.map((b, i) => (
              <button key={b} type="button" className="ln-chip" aria-pressed={lean.ring === i} onClick={() => setLean((l) => ({ ...l, ring: i }))}>
                <span className="ring-mini" aria-hidden>{'◦'.repeat(i + 1)}</span>{b}
              </button>
            ))}
          </div>
        </div>

        <div className="ln-ctl">
          <div className="label">Mood</div>
          <div className="ln-row">
            <button type="button" className="ln-chip" aria-pressed={!lean.mood} onClick={() => setLean((l) => ({ ...l, mood: null }))}>Any</button>
            {Object.entries(MOVES).map(([k, m]) => (
              <button key={k} type="button" className={`ln-chip mood ${k}`} aria-pressed={lean.mood === k}
                onClick={() => setLean((l) => ({ ...l, mood: l.mood === k ? null : k }))}>
                <span className="sw" aria-hidden />{m.ask}
              </button>
            ))}
          </div>
        </div>

        <div className="ln-ctl">
          <label className="label" htmlFor="ln-hunch">A hunch (optional)</label>
          <input id="ln-hunch" className="ln-hunch" type="text" autoComplete="off" maxLength={80}
            placeholder="something about cities" value={hunchText} onChange={(e) => setHunch(e.target.value)} />
          <div className="ln-row">
            {HUNCH_EXAMPLES.map((h) => (
              <button key={h} type="button" className="ln-chip" onClick={() => { setHunchText(h); setLean((l) => ({ ...l, hunch: h })); }}>{h}</button>
            ))}
          </div>
          <p className="muted ln-small">A hunch only lifts what’s already in your lean. It doesn’t search.</p>
        </div>

        <p className="ln-count">
          {anyLean || stems.length || lean.mood
            ? <><strong>{area.length}</strong> {area.length === 1 ? 'item sits' : 'items sit'} in the lit area today{stems.length ? <>, <strong>{nearCount}</strong> near your hunch</> : null}. The shelf takes five.</>
            : <><strong>{area.length}</strong> items in today’s pool you haven’t held.</>}
        </p>

        <div className="ln-legend" aria-hidden>
          <span><i className="sharpen" />sharpen</span>
          <span><i className="complicate" />complicate</span>
          <span><i className="bridge" />bridge</span>
          <span><i className="ground" />ground</span>
          <span><i className="halo-sw" />near your hunch</span>
          <span><i className="held-sw" />you’ve held</span>
        </div>
      </div>
    </section>
  );
}

