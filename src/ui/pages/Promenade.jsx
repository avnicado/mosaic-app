// The Promenade: a finite daily shelf for when you hold nothing in particular.
import React, { useEffect, useRef, useState } from 'react';
import { useRoute } from '../router.js';
import { useShelf, ensureShelf, refreshShelf, retryShelf, sectionTitle, sectionNote, corpusItems } from '../promenade/shelf.js';
import ShelfCard, { ShelfSkeleton } from '../promenade/ShelfCard.jsx';
import Mandala from '../promenade/Mandala.jsx';

const fmtDay = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? null : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

export default function Promenade() {
  const route = useRoute();
  const { status, shelf, meta, error, refreshes } = useShelf();
  const [view, setView] = useState('shelf'); // 'shelf' | 'mandala'
  const dev = route.query.dev === '1' || new URLSearchParams(window.location.search).get('dev') === '1';
  const holdKey = route.query.hold || null;
  const topRef = useRef(null);
  useEffect(() => { ensureShelf(); }, []);

  // Arriving from the Desk with ?hold=<url|id>: bring that card into view.
  useEffect(() => {
    if (!holdKey || status !== 'ready') return;
    const el = document.querySelector(`[data-hold-key="${CSS.escape(holdKey)}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  }, [holdKey, status]);

  const collected = meta?.generatedAt ? fmtDay(meta.generatedAt) : null;
  const sources = meta?.sources?.length || 0;
  const stale = meta?.from === '/corpus.json';

  const onRefresh = () => { refreshShelf(); topRef.current?.scrollIntoView({ block: 'start' }); };

  return (
    <div className="page wide pm-page">
      <header className="pm-head" ref={topRef}>
        <div className="eyebrow">Promenade</div>
        <h1>Today’s shelf</h1>
        <p className="soft pm-intro">
          A short walk through what was collected today, for when you aren’t holding anything in particular.
          If something catches, hold it and it becomes a thread.
        </p>
        {status === 'ready' && refreshes > 0 && <p className="muted pm-refreshed">A fresh shelf: none of these were on the one before.</p>}
        {status === 'ready' && (
          <div className="pm-view-toggle" role="tablist" aria-label="Promenade view">
            <button className={`btn ${view === 'shelf' ? 'active' : ''}`} aria-pressed={view === 'shelf'} onClick={() => setView('shelf')}>Shelf</button>
            <button className={`btn ${view === 'mandala' ? 'active' : ''}`} aria-pressed={view === 'mandala'} onClick={() => setView('mandala')}>Mandala</button>
          </div>
        )}
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

      {status === 'ready' && shelf && view === 'mandala' && (
        <>
          {stale && <div className="notice pm-stale">Today’s collection isn’t reachable, so this is an older saved shelf.</div>}
          <p className="muted pm-intro">
            One wedge per domain, rings from shallow (center) to substantive (edge) — substance per minute, not
            length or difficulty. Filled rings are what you've already held from here; the dashed ring is one
            composed pick for the next depth to try.
          </p>
          <Mandala corpusItems={corpusItems()} />
        </>
      )}

      {status === 'ready' && shelf && view === 'shelf' && (
        <>
          {stale && <div className="notice pm-stale">Today’s collection isn’t reachable, so this is an older saved shelf.</div>}
          {shelf.sections.filter((s) => s.cards.length).map((sec) => (
            <section key={sec.key} className="pm-section">
              <div className="section-head">
                <h2>{sectionTitle(sec, shelf.hasThreads)}</h2>
                <span className="muted pm-note">{sectionNote(sec, shelf.hasThreads)}</span>
              </div>
              <div className="pm-grid">
                {sec.cards.map((c) => {
                  const key = c.url || c.id;
                  return (
                    <div key={key} data-hold-key={key} className="pm-cell">
                      <ShelfCard card={c} dev={dev} startHolding={holdKey === key} />
                    </div>
                  );
                })}
              </div>
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
    </div>
  );
}
