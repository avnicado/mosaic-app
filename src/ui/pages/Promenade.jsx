// The Promenade: today's pieces tiled into the Mandala. Each tile is a piece;
// its area is how long it takes, its colour its field, darker is denser. Its
// card opens in place (beside the tile on a computer, from the bottom on a
// phone). Lean as little or as much as you like: step into a field, pick
// parts, a depth, a mood or a hunch; what doesn't fit greys out where it is.
// The open shelf (Near your threads, Far field, Open questions) is still
// composed here for the Desk, which links back with ?hold=<url|id>.
import React, { useEffect, useMemo } from 'react';
import { useRoute } from '../router.js';
import { useShelf, ensureShelf, retryShelf, corpusItems, setLean, clearLean, furtherFor } from '../promenade/shelf.js';
import ShelfCard, { ShelfSkeleton } from '../promenade/ShelfCard.jsx';
import Mandala from '../promenade/Mandala.jsx';
import { placeHeld, admittedOf } from '../promenade/mandala.js';
import { leanParts } from '../../scoring.js';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { t, loc } from '../../i18n/index.js';

const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' });
};

// Ways to widen a lean that lights too little.
function widenFor(lean) {
  const zoom = lean.fields[0] || null;
  const out = [];
  if (zoom && leanParts(lean, zoom).length) out.push([t('All of {field}', { field: t(zoom) }), () => setLean((l) => ({ ...l, parts: {} }))]);
  if (lean.ring != null) out.push([t('Any depth'), () => setLean((l) => ({ ...l, ring: null }))]);
  if (lean.mood) out.push([t('Any mood'), () => setLean((l) => ({ ...l, mood: null }))]);
  if ((lean.hunch || '').trim()) out.push([t('Drop the hunch'), () => setLean((l) => ({ ...l, hunch: '' }))]);
  if (zoom) out.push([t('All fields'), () => setLean((l) => ({ ...l, fields: [], parts: {} }))]);
  if (!out.length) out.push([t('Leave it open'), clearLean]);
  return out;
}

export default function Promenade() {
  const route = useRoute();
  const { status, shelf, meta, error, lean } = useShelf();
  const dev = route.query.dev === '1' || new URLSearchParams(window.location.search).get('dev') === '1';
  const holdKey = route.query.hold || null;
  useEffect(() => { ensureShelf(); }, []);

  // What you hold, placed on the Mandala. A Promenade-held card lives on its
  // thread's seed; items found inside sessions live in R.allItems().
  const heldRecords = useRecord(() => [
    ...R.allThreads().filter((t) => t.seed?.url).map((t) => ({ url: t.seed.url, title: t.seed.title, source: t.seed.source, excerpt: t.seed.excerpt })),
    ...R.allItems().filter((i) => i.url).map((i) => ({ url: i.url, title: i.title, source: i.source, excerpt: i.preview })),
  ], []);
  const items = status === 'ready' ? corpusItems() : [];
  const held = useMemo(() => placeHeld(items, heldRecords), [items, heldRecords]);
  const further = furtherFor(lean);

  // Arriving from the Desk with ?hold=<url|id>. A piece on the Mandala opens
  // its own card there; anything else (an open question, a piece in another
  // field than the one you're inside) is shown on its own under the Mandala.
  const zoom = lean.fields[0] || null;
  const onMandala = useMemo(() => {
    if (!holdKey) return false;
    return admittedOf(items).some((it) => it.url === holdKey && (!zoom || it.domain === zoom));
  }, [items, holdKey, zoom]);
  const deskCard = holdKey && status === 'ready' && !onMandala
    ? (shelf?.sections.flatMap((s) => s.cards) || []).find((c) => (c.url || c.id) === holdKey)
      || items.find((it) => it.url === holdKey) || null
    : null;
  useEffect(() => {
    if (deskCard) document.querySelector('.pm-desk')?.scrollIntoView({ block: 'center' });
  }, [deskCard?.url, deskCard?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const collected = meta?.generatedAt ? fmtDay(meta.generatedAt) : null;
  const sources = meta?.sources?.length || 0;
  const stale = meta?.from === '/corpus.json';

  return (
    <div className="page wide pm-page">
      <header className="pm-head">
        <div className="eyebrow">{t('Promenade')}</div>
        <h1>{t('Today, laid out as a mosaic')}</h1>
        <p className="soft pm-intro">
          {t('Every tile is a piece Mosaic collected this morning. The bigger the tile, the longer it takes; the darker, the denser. Open any tile for its card, step into a field to read titles, and lean as little or as much as you like. If something catches, hold it and it becomes a thread.')}
        </p>
      </header>

      {(status === 'idle' || status === 'loading') && (
        <>
          <p className="muted pm-loading">{t('Collecting today’s pieces. The first visit of the day can take a few seconds.')}</p>
          <ShelfSkeleton sections={1} />
        </>
      )}

      {status === 'error' && (
        <div className="pm-section">
          <div className="error">{t('Couldn’t collect today’s pieces. {error}', { error })}</div>
          <p><button className="btn" onClick={retryShelf}>{t('Try again')}</button></p>
        </div>
      )}

      {status === 'ready' && (
        <>
          {stale && <div className="notice pm-stale">{t('Today’s collection isn’t reachable, so this is an older saved one.')}</div>}
          <Mandala items={items} lean={lean} setLean={setLean} held={held}
            holdKey={onMandala ? holdKey : null} dev={dev} further={further} widen={widenFor(lean)} />

          {deskCard && (
            <section className="pm-section pm-desk">
              <div className="section-head"><h2>{t('From your Desk')}</h2><span className="muted pm-note">{deskCard.url ? t('Outside the part of the Mandala you’re in.') : t('An open question, so it has no tile.')}</span></div>
              <div className="pm-grid"><div className="pm-cell"><ShelfCard card={deskCard} dev={dev} startHolding /></div></div>
            </section>
          )}

          <footer className="pm-collected muted">
            {collected
              ? (sources ? t('Collected {day} at {time} from {n} sources.', { day: collected, time: fmtTime(meta.generatedAt), n: sources }) : t('Collected {day} at {time}.', { day: collected, time: fmtTime(meta.generatedAt) }))
              : (sources ? t('Collected today from {n} sources.', { n: sources }) : t('Collected today.'))}
            {' '}{t('Tomorrow brings a new mosaic.')}
          </footer>
        </>
      )}
    </div>
  );
}
