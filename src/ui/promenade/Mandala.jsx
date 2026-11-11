// The Mandala view of the Promenade: one radial chart, domains as wedges,
// density as rings (center = shallow, edge = substantive — scoring.js's
// densityRing(), not length or complexity). Filled rings are what you've
// held. Every empty ring carries its own composed, unranked pick — hover a
// ring to read it right there, no click-through to the shelf. Click pins
// the hovered ring open (for touch, and for reading the card without the
// mouse leaving it). See mandala.js for the composition logic and why it
// stays inside §11.
import React, { useMemo, useState } from 'react';
import { DENSITY_RING_COUNT } from '../../scoring.js';
import { buildMandala } from './mandala.js';
import ShelfCard from './ShelfCard.jsx';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import './mandala.css';

const RING_BLURB = ['barely scratched', 'a light read', 'some substance', 'demanding', 'as dense as it gets'];

const SIZE = 520;
const CENTER = SIZE / 2;
const INNER_HOLE = 34;
const MAX_R = CENTER - 56;
const RING_T = (MAX_R - INNER_HOLE) / DENSITY_RING_COUNT;

function polar(cx, cy, r, a) { return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
function wedgePath(cx, cy, rIn, rOut, a0, a1) {
  const so = polar(cx, cy, rOut, a0), eo = polar(cx, cy, rOut, a1);
  const si = polar(cx, cy, rIn, a1), ei = polar(cx, cy, rIn, a0);
  const big = (a1 - a0) > Math.PI ? 1 : 0;
  return `M ${so.x} ${so.y} A ${rOut} ${rOut} 0 ${big} 1 ${eo.x} ${eo.y} L ${si.x} ${si.y} A ${rIn} ${rIn} 0 ${big} 0 ${ei.x} ${ei.y} Z`;
}

export default function Mandala({ corpusItems }) {
  // "Held" means held anywhere in the record, not just R.allItems(): holding a
  // card straight off the Promenade (actions.js's holdItem) writes its url onto
  // the founding thread's `seed`, not into an item document — so a Promenade-
  // held card shows up on the thread, never on R.allItems(). Items found
  // *inside* a thread session (the guide's picks, Quest finds) do land in
  // R.allItems(). Both are "seen" for the Mandala's purposes. Pass the full
  // record (title/source/excerpt), not just the url: mandala.js needs it to
  // place anything that has already rotated out of today's corpus pool.
  const heldRecords = useRecord(() => [
    ...R.allThreads().filter((t) => t.seed?.url).map((t) => ({
      url: t.seed.url, title: t.seed.title, source: t.seed.source, excerpt: t.seed.excerpt,
    })),
    ...R.allItems().filter((i) => i.url).map((i) => ({
      url: i.url, title: i.title, source: i.source, excerpt: i.preview,
    })),
  ], []);
  const domains = useMemo(
    () => buildMandala(corpusItems, heldRecords),
    [corpusItems, heldRecords]
  );
  const [hovered, setHovered] = useState(null); // { domain, ring } | null
  const [pinned, setPinned] = useState(null);
  const cursor = hovered || pinned
    || (domains[0] ? { domain: domains[0].domain, ring: domains[0].frontier } : null);
  const active = domains.find((d) => d.domain === cursor?.domain) || null;
  const activeRing = active ? active.rings[cursor.ring] : null;

  if (!domains.length) return null;
  const n = domains.length;
  const sweep = (Math.PI * 2) / n;

  const cellProps = (domain, ri) => ({
    onMouseEnter: () => setHovered({ domain, ring: ri }),
    onMouseLeave: () => setHovered(null),
    onFocus: () => setHovered({ domain, ring: ri }),
    onBlur: () => setHovered(null),
    onClick: () => setPinned((p) => (p && p.domain === domain && p.ring === ri ? null : { domain, ring: ri })),
    tabIndex: 0,
  });

  return (
    <div className="mdl-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="mdl-svg">
        {Array.from({ length: DENSITY_RING_COUNT }, (_, i) => (
          <circle key={i} cx={CENTER} cy={CENTER} r={INNER_HOLE + RING_T * (i + 1)} className="mdl-grid" />
        ))}
        {domains.map((d, i) => {
          const a0 = -Math.PI / 2 + sweep * i;
          const a1 = a0 + sweep - 0.006;
          const isActive = active && d.domain === active.domain;
          return (
            <g key={d.domain} className={`mdl-wedge ${isActive ? 'active' : ''}`}>
              {d.rings.map((ring, ri) => {
                const rIn = INNER_HOLE + RING_T * ri;
                const rOut = INNER_HOLE + RING_T * (ri + 1);
                const isCursor = cursor && cursor.domain === d.domain && cursor.ring === ri;
                const isPicked = isCursor && pinned && pinned.domain === d.domain && pinned.ring === ri;
                const seenShare = d.total ? ring.seenCount / Math.max(1, d.total) : 0;
                const opacity = ring.seenCount ? Math.min(0.9, 0.22 + seenShare * 4) : 0;
                const cls = ['mdl-cell'];
                if (!ring.seenCount && ring.pick) cls.push('open');
                if (isCursor) cls.push('cursor');
                if (isPicked) cls.push('pinned');
                return (
                  <path
                    key={ri}
                    d={wedgePath(CENTER, CENTER, rIn, rOut, a0, a1)}
                    className={cls.join(' ')}
                    fill={ring.seenCount ? `rgba(143, 36, 24, ${opacity.toFixed(2)})` : 'transparent'}
                    {...cellProps(d.domain, ri)}
                  />
                );
              })}
              {(() => {
                const mid = (a0 + a1) / 2;
                const pos = polar(CENTER, CENTER, MAX_R + 16, mid);
                const anchor = Math.cos(mid) > 0.15 ? 'start' : Math.cos(mid) < -0.15 ? 'end' : 'middle';
                return (
                  <text x={pos.x} y={pos.y} textAnchor={anchor} dominantBaseline="middle" className="mdl-label">
                    {d.domain}
                  </text>
                );
              })()}
            </g>
          );
        })}
        <circle cx={CENTER} cy={CENTER} r={INNER_HOLE - 3} className="mdl-home" />
        <text x={CENTER} y={CENTER + 4} textAnchor="middle" className="mdl-home-label">home</text>
      </svg>

      <div className="mdl-detail">
        {active && activeRing ? (
          <>
            <div className="eyebrow">{active.domain} · {RING_BLURB[cursor.ring]}</div>
            {pinned && <p className="muted mdl-pinned">Pinned — click the ring again, or another ring, to move on.</p>}
            {activeRing.seenCount ? (
              <>
                <p className="muted mdl-note">You've already held {activeRing.seenCount === 1 ? 'something' : `${activeRing.seenCount} things`} here:</p>
                <ul className="mdl-seen-list">
                  {activeRing.seenItems.map((it) => <li key={it.url || it.id}>{it.title}</li>)}
                </ul>
              </>
            ) : activeRing.pick ? (
              <>
                <p className="muted mdl-note">Composed the same way the shelf is — not yet held:</p>
                <ShelfCard card={activeRing.pick} />
              </>
            ) : (
              <p className="muted mdl-note">Nothing composed for this ring right now. Refresh the shelf to try again.</p>
            )}
          </>
        ) : (
          <p className="muted">Hover a ring.</p>
        )}
      </div>
    </div>
  );
}
