// The Promenade: lean as little or as much as you like, then a finite shelf.
// The Mandala on top is where you lean (field, part, depth, mood, hunch — all
// optional). With no lean the shelf is today's open shelf (Near your threads,
// Far field, Open questions), the one the Desk reads from. With a lean it is
// five cards composed from the lit part of the Mandala, numbered to their dots.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute } from '../router.js';
import {
  useShelf, ensureShelf, refreshShelf, retryShelf, sectionTitle, sectionNote, corpusItems,
  setLean, clearLean, recomposeLean, restartLean, leanSeenCount, furtherFor,
} from '../promenade/shelf.js';
import ShelfCard, { ShelfSkeleton } from '../promenade/ShelfCard.jsx';
import Mandala, { MOVES } from '../promenade/Mandala.jsx';
import { placeHeld, RING_BLURB } from '../promenade/mandala.js';
import { DOMAINS, hasLean, leanParts, itemRing, LEAN_SHELF_SIZE } from '../../scoring.js';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';

const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function leanReason(card) {
  const where = card.part ? `${card.domain} › ${card.part}` : card.domain;
  let s = card.elsewhere
    ? `From ${where}, outside your fields: ${MOVES.bridge.why}`
    : `${cap(RING_BLURB[itemRing(card)])}, ${MOVES[card.slot]?.why || 'in your lean'}`;
  if (card.nearHunch) s += ', near your hunch';
  return s + '.' + (card.found_by === 'search' ? ' Found today by looking further.' : '');
}

// A neighbour on the Mandala for a thin lean: the next wedge either side.
function neighbourOf(lean) {
  const last = DOMAINS.indexOf(lean.fields[lean.fields.length - 1]);
  for (const o of [1, 11, 2, 10]) {
    const d = DOMAINS[(last + o) % DOMAINS.length];
    if (!lean.fields.includes(d)) return d;
  }
  return null;
}

export default function Promenade() {
  const route = useRoute();
  const { status, shelf, meta, error, refreshes, lean, leanShelf } = useShelf();
  const [hot, setHot] = useState(null);
  const dev = route.query.dev === '1' || new URLSearchParams(window.location.search).get('dev') === '1';
  const holdKey = route.query.hold || null;
  const shelfRef = useRef(null);
  useEffect(() => { ensureShelf(); }, []);

  // What you hold, placed on the Mandala. A Promenade-held card lives on its
  // thread's seed; items found inside sessions live in R.allItems().
  const heldRecords = useRecord(() => [
    ...R.allThreads().filter((t) => t.seed?.url).map((t) => ({ url: t.seed.url, title: t.seed.title, source: t.seed.source, excerpt: t.seed.excerpt })),
    ...R.allItems().filter((i) => i.url).map((i) => ({ url: i.url, title: i.title, source: i.source, excerpt: i.preview })),
  ], []);
  const items = status === 'ready' ? corpusItems() : [];
  const held = useMemo(() => placeHeld(items, heldRecords), [items, heldRecords]);

  const leaning = hasLean(lean) && !!leanShelf;
  const openCards = shelf ? shelf.sections.flatMap((s) => s.cards) : [];
  const shown = leaning ? leanShelf.picks : openCards.filter((c) => c.url);
  const numbered = shown.filter((c) => c.url).map((c, i) => ({ url: c.url, num: i + 1, domain: c.domain }));
  const numOf = new Map(numbered.map((n) => [n.url, n.num]));

  // Arriving from the Desk with ?hold=<url|id>: the Desk reads the open shelf,
  // so when a lean is set and the card isn't on it, show it on its own.
  const deskCard = holdKey && leaning && !leanShelf.picks.some((c) => (c.url || c.id) === holdKey)
    ? openCards.find((c) => (c.url || c.id) === holdKey) : null;
  useEffect(() => {
    if (!holdKey || status !== 'ready') return;
    const el = document.querySelector(`[data-hold-key="${CSS.escape(holdKey)}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [holdKey, status]);

  const collected = meta?.generatedAt ? fmtDay(meta.generatedAt) : null;
  const sources = meta?.sources?.length || 0;
  const stale = meta?.from === '/corpus.json';
  const onRefresh = () => { refreshShelf(); shelfRef.current?.scrollIntoView({ block: 'start' }); };

  const cardCell = (c, extra = {}) => {
    const key = c.url || c.id;
    return (
      <div key={key} data-hold-key={key} className="pm-cell">
        <ShelfCard card={c} dev={dev} startHolding={holdKey === key} num={c.url ? numOf.get(c.url) : null}
          hot={!!c.url && hot === c.url} onHot={c.url ? setHot : null} {...extra} />
      </div>
    );
  };

  return (
    <div className="page wide pm-page">
      <header className="pm-head">
        <div className="eyebrow">Promenade</div>
        <h1>Lean as little or as much as you like</h1>
        <p className="soft pm-intro">
          No question needed. Leave the Mandala open and the shelf is ready. Tap a wedge to lean toward a field, step
          inside it to pick a part, set a depth, a mood or a half-formed hunch. Every step is optional, and the shelf
          underneath still ends. If something catches, hold it and it becomes a thread.
        </p>
      </header>

      {(status === 'idle' || status === 'loading') && (
        <>
          <p className="muted pm-loading">Collecting today’s shelf. The first visit of the day can take a few seconds.</p>
          <ShelfSkeleton />
        </>
      )}

      {status === 'error' && (
        <div className="pm-section">
          <div className="error">Couldn’t collect the shelf. {error}</div>
          <p><button className="btn" onClick={retryShelf}>Try again</button></p>
        </div>
      )}

      {status === 'ready' && shelf && (
        <>
          {stale && <div className="notice pm-stale">Today’s collection isn’t reachable, so this is an older saved shelf.</div>}
          <Mandala items={items} lean={lean} setLean={setLean} held={held} numbered={numbered} hot={hot} setHot={setHot} />

          <div ref={shelfRef} />
          {deskCard && (
            <section className="pm-section">
              <div className="section-head"><h2>From your Desk</h2><span className="muted pm-note">On today’s open shelf. Your lean is kept below.</span></div>
              <div className="pm-grid">{cardCell(deskCard, { num: null })}</div>
            </section>
          )}

          {leaning ? (
            <LeanShelf shelf={leanShelf} lean={lean} cardCell={cardCell} />
          ) : (
            <>
              {refreshes > 0 && <p className="muted pm-refreshed">A fresh shelf: none of these were on the one before.</p>}
              {shelf.sections.filter((s) => s.cards.length).map((sec) => (
                <section key={sec.key} className="pm-section">
                  <div className="section-head">
                    <h2>{sectionTitle(sec, shelf.hasThreads)}</h2>
                    <span className="muted pm-note">{sectionNote(sec, shelf.hasThreads)}</span>
                  </div>
                  <div className="pm-grid">{sec.cards.map((c) => cardCell(c))}</div>
                </section>
              ))}
              <footer className="pm-end">
                <div className="pm-end-rule" aria-hidden>✦</div>
                <h2>That’s today’s shelf.</h2>
                <p className="muted">
                  {collected ? <>Collected {collected}{meta.generatedAt ? ` at ${fmtTime(meta.generatedAt)}` : ''}</> : 'Collected today'}
                  {sources ? ` from ${sources} sources` : ''}.
                </p>
                <button className="btn" onClick={onRefresh}>Refresh the shelf</button>
                <p className="muted pm-end-small">Refreshing sets out cards you haven’t seen this visit.</p>
              </footer>
            </>
          )}
        </>
      )}
    </div>
  );
}

function LeanShelf({ shelf, lean, cardCell }) {
  const n = shelf.picks.length;
  const seen = leanSeenCount();
  const narrowed = lean.fields.filter((d) => leanParts(lean, d).length);
  const neighbour = lean.fields.length && lean.fields.length < 3 ? neighbourOf(lean) : null;
  const widen = [];
  narrowed.forEach((d) => widen.push([`Open up all of ${d}`, () => setLean((l) => { const parts = { ...l.parts }; delete parts[d]; return { ...l, parts }; })]));
  if (lean.ring != null) widen.push(['Any depth', () => setLean((l) => ({ ...l, ring: null }))]);
  if (neighbour) widen.push([`Add a neighbour: ${neighbour}`, () => setLean((l) => ({ ...l, fields: [...l.fields, neighbour] }))]);
  if (lean.mood) widen.push(['Drop the mood', () => setLean((l) => ({ ...l, mood: null }))]);
  if ((lean.hunch || '').trim() && !lean.fields.length && lean.ring == null) widen.push(['Drop the hunch', () => setLean((l) => ({ ...l, hunch: '' }))]);
  if (seen) widen.push(['Start this lean over', restartLean]);
  if (!widen.length) widen.push(['Leave it open', clearLean]);

  const further = furtherFor(lean);
  const looking = !!further && (further.status === 'waiting' || further.status === 'looking');
  const lead = seen
    ? `${n === 0 ? 'Nothing is' : `Only ${n} ${n === 1 ? 'thing is' : 'things are'}`} left here that you haven’t seen this visit.`
    : n === 0 ? 'Nothing sits in this part of the Mandala today.' : `Only ${n} ${n === 1 ? 'thing sits' : 'things sit'} in this part of the Mandala today.`;

  return (
    <section className="pm-section" aria-live="polite">
      <div className="section-head">
        <h2>Your shelf</h2>
        <span className="muted pm-note">{n ? `${n} ${n === 1 ? 'card' : 'cards'}, composed from your lean.` : ''}{' '}
          <button type="button" className="btn link" onClick={clearLean}>Leave it open</button>
        </span>
      </div>
      {n > 0 && <div className="pm-lean-grid">{shelf.picks.map((c) => cardCell(c, { reason: leanReason(c) }))}</div>}

      {n < LEAN_SHELF_SIZE ? (
        <div className="pm-thin">
          {looking ? (
            <p className="pm-looking"><span className="spinner" aria-hidden /> {lead} Looking further afield for more that fits…</p>
          ) : (
            <>
              {further?.status === 'done' && !seen && <p>Mosaic also looked further afield for this lean today{further.found ? ` and found ${further.found} more` : ', and nothing more turned up'}.</p>}
              {further?.status === 'error' && <p>{further.message}</p>}
              <p>{lead} Rather than pad the shelf with things outside your lean, widen it:</p>
            </>
          )}
          <div className="ln-row">
            {widen.map(([label, fn]) => <button key={label} type="button" className="ln-chip" onClick={fn}>{label}</button>)}
          </div>
        </div>
      ) : (
        <footer className="pm-end">
          <div className="pm-end-rule" aria-hidden>✦</div>
          <h2>That’s the shelf for this lean.</h2>
          <p className="muted">
            {shelf.left
              ? `${shelf.left} more ${shelf.left === 1 ? 'sits' : 'sit'} in the lit part of the Mandala. Recompose sets out the next few; nothing scrolls on forever.`
              : 'That’s everything in the lit part of the Mandala today. Move your lean to walk somewhere else.'}
          </p>
          {shelf.left > 0 && <button className="btn primary" onClick={recomposeLean}>Recompose</button>}
        </footer>
      )}
    </section>
  );
}

