// The tiled Mandala: today's pieces laid into the Mandala as a mosaic, and the
// place you lean. A tile's area is how long the piece takes, its colour is
// its field, and the darker it is, the denser the read (stone-cutting in
// tiles.js). Point at a tile (on a computer) and its card opens beside it;
// click to keep it open. On a phone a tap brings the card up from the bottom,
// with Previous and Next through that field. Tap a field's name to step
// inside it: its parts get their own wedges and bigger tiles carry titles.
// Depth and mood light the tiles that fit and grey the rest; nothing moves,
// so the Mandala keeps its shape while you lean. A hunch marks the pieces
// that mention it.
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PARTS, hunchStems, nearHunch, leanParts, itemRing, fitsLean, LEAN_SHELF_SIZE, DENSITY_RING_COUNT } from '../../scoring.js';
import { lengthText, shortMinutes, fmtMinutes } from '../../length.js';
import { RING_BLURB, admittedOf } from './mandala.js';
import {
  SIZE, C, INNER, R, SHORT, slicesFor, cutSlice, isCut, polar, hsl, greyed, tesseraHSL, fieldHue, depthT,
} from './tiles.js';
import ShelfCard from './ShelfCard.jsx';
import './mandala.css';

export const MOVES = {
  sharpen: { ask: 'Go deeper', phrase: 'that go deeper', why: 'it cuts closer to a frame' },
  complicate: { ask: 'Push back on me', phrase: 'that push back', why: 'it resists the easy framing' },
  bridge: { ask: 'Surprise me', phrase: 'from somewhere unexpected', why: 'the same shape in a different field' },
  ground: { ask: 'Something concrete', phrase: 'that stay concrete', why: 'a specific, concrete case' },
};
const RING_PHRASE = ['that barely scratch the surface', 'that are a light read', 'with some substance', 'that are demanding', 'as dense as they get'];
const HUNCH_EXAMPLES = ['something about cities', 'how things wear out', 'maps', 'time'];
const METER_CAPTION = [
  'Wide open. A good way to start when you’re not sure.',
  'A light lean.',
  'Leaning some.',
  'Leaning in.',
  'As focused as it gets, short of a question.',
];
const PHONE_SHORT = { 'sport & play': 'sport' };

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const andList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

function useMedia(query) {
  const get = () => typeof matchMedia !== 'undefined' && matchMedia(query).matches;
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return undefined;
    const m = matchMedia(query);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener?.('change', f);
    return () => m.removeEventListener?.('change', f);
  }, [query]);
  return on;
}

// Words that fit a tile: wrapped to its width, at most `lines` lines.
function wrap(text, perLine, lines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= perLine || !cur) cur = next;
    else { out.push(cur); cur = w; }
    if (out.length === lines) break;
  }
  if (out.length < lines && cur) out.push(cur);
  const used = out.join(' ').split(/\s+/).length;
  if (out.length && used < words.length) out[out.length - 1] = out[out.length - 1].replace(/[\s,.;:–—-]*$/, '').slice(0, Math.max(1, perLine - 1)) + '…';
  return out.map((l) => (l.length > perLine + 1 ? l.slice(0, perLine) + '…' : l));
}

function togglePart(lean, d, p) {
  const cur = leanParts(lean, d);
  let next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
  if (next.length === (PARTS[d] || []).length) next = []; // all four parts is the whole field
  const parts = { ...lean.parts };
  if (next.length) parts[d] = next; else delete parts[d];
  return { ...lean, parts };
}

export function leanStatement(lean) {
  const zoom = lean.fields[0] || null;
  const parts = zoom ? leanParts(lean, zoom) : [];
  const where = zoom ? `in ${zoom}${parts.length ? ` (${andList(parts)})` : ''}` : 'anywhere';
  const bits = [lean.ring != null ? RING_PHRASE[lean.ring] : '', lean.mood ? MOVES[lean.mood].phrase : ''].filter(Boolean);
  if (!zoom && !bits.length) return 'Wide open. Every tile is lit';
  return bits.length ? `Pieces ${bits.join(' and ')}, ${where}` : `Anything ${where}`;
}

function whyHere(it, lit, stems) {
  let s = `${cap(RING_BLURB[itemRing(it)])}, and ${MOVES[it.slot]?.why || 'it fits the day'}.`;
  if (stems.length && nearHunch(it, stems)) s += ' Near your hunch.';
  if (!lit) s += ' Outside your lean.';
  if (it.found_by === 'search') s += ' Found today by looking further.';
  return s;
}

export default function Mandala({ items, lean, setLean, held, holdKey, dev, further, widen }) {
  const phone = useMedia('(max-width: 600px)');
  const noHover = useMedia('(hover: none)');
  const sheet = phone || noHover;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const zoom = lean.fields.length === 1 ? lean.fields[0] : null;
  const pool = useMemo(() => admittedOf(items), [items]);
  const slices = useMemo(() => slicesFor(zoom, pool), [zoom, pool]);

  // Stones: straight-cracked at once, rounder ones swapped in a slice at a time.
  const [, setRounded] = useState(0);
  useEffect(() => {
    let alive = true, timer = null;
    const todo = slices.filter((s) => s.items.length > 2 && !isCut(s, true));
    const step = () => {
      if (!alive || !todo.length) return;
      cutSlice(todo.shift(), true);
      setRounded((n) => n + 1);
      timer = setTimeout(step, 30);
    };
    timer = setTimeout(step, 60);
    return () => { alive = false; clearTimeout(timer); };
  }, [slices]);
  const tiles = slices.flatMap((s) => cutSlice(s, isCut(s, true) || s.items.length <= 2));
  const tileOf = useMemo(() => new Map(tiles.map((t) => [t.url, t])), [tiles]);

  // How big the chart is on screen: text and strokes keep their size.
  const svgRef = useRef(null);
  const [width, setWidth] = useState(560);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const w = e.contentRect.width; if (w > 0) setWidth(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]); // the svg is remade on stepping in or out
  const half = phone ? R + 34 : C;
  const k = (half * 2) / Math.max(200, width);

  // The lean.
  const stems = useMemo(() => hunchStems(lean.hunch), [lean.hunch]);
  const heldUrls = useMemo(() => new Set(held.map((h) => h.url)), [held]);
  const zoomParts = zoom ? leanParts(lean, zoom) : [];
  const leaning = lean.ring != null || !!lean.mood || zoomParts.length > 0;
  const fits = useCallback((it) => fitsLean(it, lean), [lean]);
  const inView = zoom ? pool.filter((it) => it.domain === zoom) : pool;
  const lit = inView.filter(fits);
  const litFresh = lit.filter((it) => !heldUrls.has(it.url) && (!stems.length || nearHunch(it, stems)));
  const nearCount = stems.length ? lit.filter((it) => nearHunch(it, stems)).length : 0;
  const totalMin = inView.reduce((s, it) => s + (it.minutes || 0), 0);

  // The card: hovered (computer) or pinned (click, tap, or from the Desk).
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);
  const [holding, setHolding] = useState(null);
  const hoverTimer = useRef(null);
  const active = pinned || (!sheet ? hover : null);
  const activeTile = active ? tileOf.get(active) : null;
  useEffect(() => { if (pinned && !tileOf.has(pinned)) setPinned(null); }, [tileOf, pinned]);
  useEffect(() => { setHover(null); }, [zoom]);

  // Arriving from the Desk with ?hold=<url>: open that piece's card, holding.
  const fromDesk = useRef(null);
  useEffect(() => {
    if (!holdKey || fromDesk.current === holdKey || !tileOf.has(holdKey)) return;
    fromDesk.current = holdKey;
    setPinned(holdKey); setHolding(holdKey);
  }, [holdKey, tileOf]);

  const tileEls = useRef(new Map());
  const stageRef = useRef(null);
  const popRef = useRef(null);
  const [popAt, setPopAt] = useState(null);
  useLayoutEffect(() => {
    if (sheet || !activeTile) { setPopAt(null); return; }
    const el = tileEls.current.get(activeTile.url), stage = stageRef.current, pop = popRef.current;
    if (!el || !stage || !pop) return;
    const wrapR = stage.getBoundingClientRect(), tr = el.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = tr.right - wrapR.left + 12;
    if (wrapR.left + left + w > window.innerWidth - 12) left = tr.left - wrapR.left - w - 12;
    left = Math.min(Math.max(left, 12 - wrapR.left), window.innerWidth - wrapR.left - w - 12);
    let top = tr.top - wrapR.top + tr.height / 2 - 70;
    top = Math.min(Math.max(top, 0), Math.max(0, wrapR.height - h));
    setPopAt({ left, top });
  }, [activeTile, sheet, width, holding, zoom]);

  // On a phone, keep the tapped tile in view above the sheet.
  useEffect(() => {
    if (!sheet || !pinned) return;
    const el = tileEls.current.get(pinned);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const want = window.innerHeight * 0.24;
    if (r.top + r.height / 2 > window.innerHeight * 0.38 || r.top < 0) window.scrollBy({ top: r.top + r.height / 2 - want, behavior: 'smooth' });
  }, [pinned, sheet]);

  // A click anywhere else, or Escape, puts the card away.
  useEffect(() => {
    if (!pinned) return undefined;
    const onDoc = (e) => {
      if (e.target.closest?.('.tm-pop, .tm-sheet, .tm-tile')) return;
      setPinned(null); setHolding(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') { setPinned(null); setHolding(null); tileEls.current.get(pinned)?.focus?.(); } };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); };
  }, [pinned]);

  const onEnter = (url) => (e) => {
    if (e.pointerType !== 'mouse' || sheet) return;
    clearTimeout(hoverTimer.current);
    if (!pinned) setHover(url);
  };
  const onLeave = (e) => {
    if (e.pointerType !== 'mouse' || sheet) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 160);
  };
  const pin = (url) => { setHover(null); setHolding(null); setPinned(url); };
  const onTileClick = (url) => (e) => {
    e.stopPropagation();
    if (!sheet && pinned === url) { setPinned(null); setHolding(null); return; }
    pin(url);
  };
  const onTileKey = (url) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pin(url); } };

  // Previous / Next in the sheet: the rest of that slice, lit ones when leaning, inside out.
  const walk = useMemo(() => {
    if (!activeTile) return [];
    const list = tiles.filter((t) => t.it.domain === activeTile.it.domain && (!leaning || fits(t.it) || t.url === activeTile.url));
    const ang = (t) => Math.atan2(t.c[1] - C, t.c[0] - C);
    return list.sort((a, b) => itemRing(a.it) - itemRing(b.it) || ang(a) - ang(b));
  }, [activeTile, tiles, leaning, fits]);
  const at = activeTile ? walk.indexOf(activeTile) : -1;
  const stepTo = (d) => { if (walk.length > 1) pin(walk[(at + d + walk.length) % walk.length].url); };

  // Zooming in and out of a field.
  const [anim, setAnim] = useState('');
  const go = (cls) => {
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    setAnim(reduce ? '' : cls);
  };
  const stepInto = (d) => { go('zooming'); setPinned(null); setLean((l) => ({ ...l, fields: [d], parts: {} })); };
  const stepOut = () => { go('unzooming'); setPinned(null); setLean((l) => ({ ...l, fields: [], parts: {} })); };
  const onKey = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } };

  // Hunch, typed: settle a moment before it changes the lean.
  const [hunchText, setHunchText] = useState(lean.hunch || '');
  const hunchTimer = useRef(null);
  useEffect(() => { if ((lean.hunch || '') !== hunchText.trim()) setHunchText(lean.hunch || ''); }, [lean.hunch]); // eslint-disable-line react-hooks/exhaustive-deps
  const setHunch = (v) => {
    setHunchText(v);
    clearTimeout(hunchTimer.current);
    hunchTimer.current = setTimeout(() => setLean((l) => ({ ...l, hunch: v.trim().slice(0, 80) })), 300);
  };

  const meterSteps = [!!zoom, zoomParts.length > 0, lean.ring != null || !!lean.mood, !!(lean.hunch || '').trim()];
  const meterN = meterSteps.filter(Boolean).length;
  const anyLean = meterN > 0;
  const thin = anyLean && litFresh.length < LEAN_SHELF_SIZE;
  const looking = further && (further.status === 'waiting' || further.status === 'looking');

  // ---- drawing ----
  const fillOf = (t) => (!leaning || fits(t.it) ? hsl(t.col) : greyed(t.col));
  const inkOf = (t) => (leaning && !fits(t.it) ? 'var(--ink-faded)' : t.col.l < 54 ? 'var(--on-dark)' : 'var(--ink)');
  const rimPx = phone ? (zoom ? 12.5 : 10.5) : zoom ? 13 : 11.5;

  // One name per field (or part), across all the wedges it is laid in.
  const spans = slices.filter((s) => s.first).map((s) => ({ ...s, a0: s.span.a0, sweep: s.span.sweep, items: slices.filter((x) => x.group === s.group).flatMap((x) => x.items) }));
  const rim = spans.map((s, si) => {
    const a0 = s.a0, a1 = s.a0 + s.sweep, mid = (a0 + a1) / 2;
    const lower = Math.sin(mid) > 0.05;
    const n = s.items.filter(fits).length;
    const name = phone && !zoom ? (PHONE_SHORT[s.domain] || s.label) : s.label;
    const words = leaning || (zoom && zoomParts.length) ? `${name} ${n}` : name;
    const arcLen = Math.min(s.sweep, 2.6) * (R + 10) * 0.92;
    const fs = Math.max(8.5 * k, Math.min(rimPx * k, arcLen / (words.length * 0.6)));
    const r = lower ? R + 7 + fs * 0.78 : R + 7;
    const hw = Math.min(s.sweep, 2.6) / 2; // the name sits on the middle of a wide span
    const [sx, sy] = polar(r, lower ? mid + hw : mid - hw), [ex, ey] = polar(r, lower ? mid - hw : mid + hw);
    const big = s.sweep > Math.PI ? 1 : 0;
    const id = `${uid}-rim-${si}`;
    const on = zoom ? zoomParts.includes(s.part) : false;
    const act = zoom ? (s.unsorted ? null : () => setLean((l) => togglePart(l, zoom, s.part))) : () => stepInto(s.domain);
    const [h0x, h0y] = polar(R + 2, a0), [h1x, h1y] = polar(R + 2, a1), [h2x, h2y] = polar(R + 32, a1), [h3x, h3y] = polar(R + 32, a0);
    return (
      <g key={s.key} className={`tm-rim-g ${act ? 'act' : ''}`}
        {...(act ? {
          tabIndex: 0, role: 'button',
          'aria-label': zoom ? `${s.part}${on ? ', chosen' : ''}. ${s.items.length} pieces` : `Step into ${s.domain}. ${s.items.length} pieces`,
          'aria-pressed': zoom ? on : undefined,
          onClick: (e) => { e.stopPropagation(); act(); }, onKeyDown: onKey(act),
        } : { 'aria-hidden': true })}>
        <path d={`M${h0x} ${h0y}A${R + 2} ${R + 2} 0 ${big} 1 ${h1x} ${h1y}L${h2x} ${h2y}A${R + 32} ${R + 32} 0 ${big} 0 ${h3x} ${h3y}Z`} className="tm-rim-hit" />
        <path id={id} d={`M${sx} ${sy}A${r} ${r} 0 0 ${lower ? 0 : 1} ${ex} ${ey}`} className="tm-rim-path" />
        <text className={`tm-rim ${on ? 'on' : ''} ${s.items.length ? '' : 'empty'}`} fontSize={fs.toFixed(1)}>
          <textPath href={`#${id}`} xlinkHref={`#${id}`} startOffset="50%" textAnchor="middle">
            {name}{words !== name ? <>{' '}<tspan className="n">{n}</tspan></> : null}
          </textPath>
        </text>
      </g>
    );
  });

  const labels = [];
  for (const t of tiles) {
    const px = t.ir / k;
    if (zoom && px >= 26) {
      const fs = 12.5 * k, w = t.ir * 1.75, h = t.ir * 1.5;
      const perLine = Math.max(4, Math.floor(w / (fs * 0.5)));
      const nLines = Math.max(2, Math.min(5, Math.floor(h / (fs * 1.18))));
      const lines = wrap(t.it.title, perLine, nLines);
      const y0 = t.c[1] - ((lines.length - 1) * fs * 1.15) / 2;
      labels.push(
        <text key={t.url} className="tm-title" x={t.c[0]} fontSize={fs.toFixed(1)} fill={inkOf(t)}>
          {lines.map((l, i) => <tspan key={i} x={t.c[0]} y={y0 + i * fs * 1.15}>{l}</tspan>)}
        </text>,
      );
    } else if (px >= 11) {
      labels.push(<text key={t.url} className="tm-min" x={t.c[0]} y={t.c[1]} fontSize={(9.5 * k).toFixed(1)} fill={inkOf(t)}>{shortMinutes(t.it.minutes || 0)}</text>);
    }
  }

  const ringSwatch = (r) => hsl(tesseraHSL(fieldHue('science'), depthT(r)));
  const card = activeTile && (
    <ShelfCard card={activeTile.it} dev={dev} reason={whyHere(activeTile.it, !leaning || fits(activeTile.it), stems)}
      key={activeTile.url} startHolding={holding === activeTile.url}>
      {!zoom && (
        <button type="button" className="btn link tm-step" onClick={(e) => { e.stopPropagation(); stepInto(activeTile.it.domain); }}>
          Step into {SHORT[activeTile.it.domain]}
        </button>
      )}
    </ShelfCard>
  );

  return (
    <section className="tm" aria-label="Today’s pieces, tiled into the Mandala">
      <div className="tm-stage" ref={stageRef}>
        <nav className="tm-crumbs" aria-label="Where you are on the Mandala">
          {zoom ? (
            <>
              <button type="button" onClick={stepOut}>All fields</button>
              <span className="sep" aria-hidden>›</span>
              <span className="here">{zoom}</span>
              <span className="note">its parts</span>
            </>
          ) : (<><span className="here">All fields</span><span className="note">Tap a name to step inside</span></>)}
        </nav>

        <svg ref={svgRef} key={zoom || 'all'}
          className={`tm-svg ${zoom ? 'zoomed' : ''} ${phone ? 'phone' : ''} ${anim}`}
          viewBox={`${C - half} ${C - half} ${half * 2} ${half * 2}`}
          role="group" aria-label={zoom ? `Inside ${zoom}: ${inView.length} pieces` : `Today’s ${pool.length} pieces, tiled by field`}>
          <circle cx={C} cy={C} r={R + 1} className="tm-ground" />
          <g>
            {tiles.map((t) => (
              <path key={t.url} ref={(el) => { if (el) tileEls.current.set(t.url, el); else tileEls.current.delete(t.url); }}
                d={t.d} fill={fillOf(t)} className="tm-tile" tabIndex={0} role="button"
                aria-label={`${t.it.title}, ${t.it.source || ''}, ${lengthText(t.it)}${leaning && !fits(t.it) ? ', outside your lean' : ''}`}
                onPointerEnter={onEnter(t.url)} onPointerLeave={onLeave}
                onClick={onTileClick(t.url)} onKeyDown={onTileKey(t.url)} />
            ))}
          </g>
          <g aria-hidden className="tm-marks">
            {spans.map((s) => { const [x0, y0] = polar(INNER - 2, s.a0), [x1, y1] = polar(R + 1, s.a0); return <line key={s.key} x1={x0} y1={y0} x2={x1} y2={y1} className="tm-seam" />; })}
            {spans.filter((s) => !s.items.length && s.sweep > 0.6).map((s) => {
              const [mx, my] = polar((INNER + R) / 2, s.a0 + s.sweep / 2);
              return <text key={s.key} x={mx} y={my} className="tm-empty" fontSize={(10.5 * k).toFixed(1)}>none today</text>;
            })}
            {stems.length > 0 && tiles.filter((t) => (!leaning || fits(t.it)) && nearHunch(t.it, stems)).map((t) => <path key={t.url} d={t.d} className="tm-hunch" />)}
          </g>
          <g aria-hidden className="tm-labels">{labels}</g>
          <g aria-hidden className="tm-marks">
            {tiles.filter((t) => heldUrls.has(t.url)).map((t) => <circle key={t.url} cx={t.c[0]} cy={t.c[1] + (t.ir / k >= 11 ? 9 * k : 0)} r={3.2 * k} className="tm-held" />)}
            {activeTile && <path d={activeTile.d} className={`tm-edge ${pinned ? 'pinned' : ''}`} />}
          </g>
          <g>{rim}</g>
          {zoom ? (
            <g className="tm-hub back" tabIndex={0} role="button" aria-label="Back to all fields"
              onClick={(e) => { e.stopPropagation(); stepOut(); }} onKeyDown={onKey(stepOut)}>
              <circle cx={C} cy={C} r={INNER - 5} />
              <text x={C} y={C - 7 * k} fontSize={(10 * k).toFixed(1)}>‹ all</text>
              <text x={C} y={C + 8 * k} fontSize={(10 * k).toFixed(1)}>fields</text>
            </g>
          ) : (
            <g className="tm-hub" aria-hidden>
              <circle cx={C} cy={C} r={INNER - 5} />
              <text x={C} y={C - 6 * k} fontSize={(10 * k).toFixed(1)}>today</text>
              <text x={C} y={C + 9 * k} fontSize={(12 * k).toFixed(1)}>{pool.length}</text>
            </g>
          )}
        </svg>

        <p className="tm-hint">
          {sheet
            ? (zoom ? 'Bigger tiles carry their titles. Tap any tile for its card.' : 'Tap a tile for its card. Small tiles show only colour, so step into a field to read titles.')
            : (zoom ? 'Bigger tiles carry their titles. Point at any tile for its card, click to keep it open.' : 'Point at a tile for its card, click to keep it open. The number on a tile is its length.')}
        </p>

        {!sheet && activeTile && (
          <div className="tm-pop" ref={popRef} style={popAt ? { left: popAt.left, top: popAt.top } : { visibility: 'hidden', left: 0, top: 0 }}
            onPointerEnter={() => clearTimeout(hoverTimer.current)}
            onPointerLeave={(e) => { if (!pinned) onLeave(e); }}>
            {pinned && <button type="button" className="tm-x" aria-label="Close" onClick={() => { setPinned(null); setHolding(null); }}>×</button>}
            {card}
          </div>
        )}
      </div>

      <div className="tm-panel">
        <div className="tm-now">
          <div className="label">Your lean</div>
          <p className="tm-statement">
            {leanStatement(lean)}
            {(lean.hunch || '').trim() && <>, leaning toward <em>“{lean.hunch.trim()}”</em></>}.
          </p>
          <div className="tm-meter" aria-hidden>{meterSteps.map((on, i) => <span key={i} className={on ? 'on' : ''} />)}</div>
          <p className="tm-meter-cap">{METER_CAPTION[meterN]}</p>
          <p className="tm-count" aria-live="polite">
            {leaning
              ? <><strong>{lit.length}</strong> of {inView.length} pieces lit. The rest stay in place, greyed.</>
              : <><strong>{inView.length}</strong> {inView.length === 1 ? 'piece' : 'pieces'}{zoom ? ` in ${zoom}` : ' today'}, about {fmtMinutes(Math.max(1, totalMin)) || '0 min'} in all.</>}
            {stems.length ? <> <strong>{nearCount}</strong> near your hunch.</> : null}
          </p>
        </div>

        {thin && (
          <div className="tm-thin" aria-live="polite">
            {looking ? (
              <p className="tm-looking"><span className="spinner" aria-hidden /> Only {litFresh.length} {litFresh.length === 1 ? 'piece fits' : 'pieces fit'} here today. Looking further afield for more…</p>
            ) : (
              <>
                {further?.status === 'done' && <p>Mosaic looked further afield for this lean today{further.found ? ` and laid in ${further.found} more` : ', and nothing more turned up'}.</p>}
                {further?.status === 'error' && <p>{further.message}</p>}
                <p>Only {litFresh.length} {litFresh.length === 1 ? 'piece fits' : 'pieces fit'} here today. Widen the lean to light more:</p>
              </>
            )}
            <div className="tm-row">
              {widen.map(([label, fn]) => <button key={label} type="button" className="tm-chip" onClick={fn}>{label}</button>)}
            </div>
          </div>
        )}

        <div className="tm-ctl">
          <div className="label">How deep</div>
          <div className="tm-row">
            <button type="button" className="tm-chip" aria-pressed={lean.ring == null} onClick={() => setLean((l) => ({ ...l, ring: null }))}>Any depth</button>
            {RING_BLURB.map((b, i) => (
              <button key={b} type="button" className="tm-chip" aria-pressed={lean.ring === i} onClick={() => setLean((l) => ({ ...l, ring: l.ring === i ? null : i }))}>
                <span className="ramp" style={{ background: ringSwatch(i) }} aria-hidden />{b}
              </button>
            ))}
          </div>
        </div>

        <div className="tm-ctl">
          <div className="label">In the mood for</div>
          <div className="tm-row">
            <button type="button" className="tm-chip" aria-pressed={!lean.mood} onClick={() => setLean((l) => ({ ...l, mood: null }))}>Anything</button>
            {Object.entries(MOVES).map(([key, m]) => (
              <button key={key} type="button" className={`tm-chip mood ${key}`} aria-pressed={lean.mood === key}
                onClick={() => setLean((l) => ({ ...l, mood: l.mood === key ? null : key }))}>
                <span className="sw" aria-hidden />{m.ask}
              </button>
            ))}
          </div>
        </div>

        <div className="tm-ctl">
          <label className="label" htmlFor={`${uid}-hunch`}>A hunch (optional)</label>
          <input id={`${uid}-hunch`} className="tm-hunch-in" type="text" autoComplete="off" maxLength={80}
            placeholder="something about cities" value={hunchText} onChange={(e) => setHunch(e.target.value)} />
          <div className="tm-row">
            {HUNCH_EXAMPLES.map((h) => (
              <button key={h} type="button" className="tm-chip" onClick={() => { setHunchText(h); setLean((l) => ({ ...l, hunch: h })); }}>{h}</button>
            ))}
          </div>
          <p className="muted tm-small">A hunch outlines the pieces that mention it. It doesn’t grey anything.</p>
        </div>

        <div className="tm-key" aria-hidden>
          <div className="tm-key-row">
            <div className="tm-sizes">
              {[[5, '5 min'], [30, '30 min'], [90, '90 min']].map(([m, lab]) => {
                const s = 2.7 * Math.sqrt(m);
                const pts = Array.from({ length: 7 }, (_, j) => { const a = (j / 7) * Math.PI * 2 + (j % 3) * 0.17, q = s * (0.84 + ((j * 37) % 10) / 50); return `${(s + 2 + Math.cos(a) * q).toFixed(1)},${(s + 2 + Math.sin(a) * q).toFixed(1)}`; }).join(' ');
                return <figure key={m}><svg width={Math.round(s * 2 + 4)} height={Math.round(s * 2 + 4)}><polygon points={pts} fill={hsl(tesseraHSL(fieldHue('philosophy & ideas'), 0.5))} /></svg>{lab}</figure>;
              })}
            </div>
            <span><b>Size is length.</b> A tile’s area is its minutes, so an hour-long piece takes twelve times the room of a five-minute one. “About” on a card means the length is an estimate.</span>
          </div>
          <div className="tm-key-row">
            <div className="tm-ramp">{Array.from({ length: DENSITY_RING_COUNT }, (_, r) => <i key={r} style={{ background: ringSwatch(r) }} />)}</div>
            <span><b>Darker is denser,</b> from barely scratched to as dense as it gets. Colour is the field.</span>
          </div>
          <div className="tm-key-row">
            <span className="tm-key-sw held" /><span>You hold it.</span>
            <span className="tm-key-sw hunch" /><span>Near your hunch.</span>
          </div>
        </div>
      </div>

      {sheet && (
        <div className={`tm-sheet ${activeTile ? 'open' : ''}`} aria-hidden={!activeTile}>
          {activeTile && (
            <div className="tm-sheet-card" role="dialog" aria-label={activeTile.it.title}>
              <div className="tm-grab" aria-hidden />
              <button type="button" className="tm-x" aria-label="Close" onClick={() => { setPinned(null); setHolding(null); }}>×</button>
              {card}
              {walk.length > 1 && (
                <div className="tm-step-row">
                  <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); stepTo(-1); }}>‹ Previous</button>
                  <span className="tm-pos">{at + 1} of {walk.length}</span>
                  <button type="button" className="btn" onClick={(e) => { e.stopPropagation(); stepTo(1); }}>Next ›</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export { SIZE };
