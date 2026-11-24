// The views on a thread's question, for everyone, drawn the way the
// views page draws them: the mandala, the pop-ups with real articles for each
// ring, and each view's case. It replaces the older chart (ViewsPanel.jsx,
// kept for now) in the same spot under the question.
//
// For a new wording it maps the question by itself once the reading is done;
// for an older thread there's a button. A ready example opens at once.
import React, { useCallback, useEffect } from 'react';
import { useBusy } from '../../data/hooks.js';
import { currentViewsMap, wantsViewsMap, requestViewsMap, setViewsMapOpen, ringItemsFor, requestRingItems } from '../../data/views.js';
import { Result, Working } from '../../viewsdemo/ViewsPage.jsx';
import '../../viewsdemo/viewsdemo.css';
import './views.css';

export default function ThreadViews({ thread }) {
  const busy = useBusy(thread.id);
  const v = currentViewsMap(thread);
  const working = busy.viewsMap;
  // A ring with too few checked articles looks for items about its question.
  const loadRing = useCallback((k, opts) => requestRingItems(thread.id, k, opts), [thread.id]);
  const ringItems = (k) => ringItemsFor(thread, k);
  const otherWork = busy.reading || busy.judging || (busy.filling && busy.filling.size > 0);

  // The automatic check: a new wording, once, after the reading and the feed.
  useEffect(() => {
    if (working || otherWork) return;
    if (wantsViewsMap(thread) && thread.reading) requestViewsMap(thread.id);
  }, [thread.id, thread.articulations?.length, !!thread.reading, !!otherWork, !!working]);

  if (thread.status === 'closed') return null;

  if (working) {
    return (
      <section className="vp section" aria-live="polite">
        <div className="vp-head">
          <div>
            <div className="eyebrow">Views</div>
            <h2 className="vp-title">Mapping the views on this question</h2>
          </div>
          <span className="th-spacer" />
        </div>
        <div className="vd-embed"><Working /></div>
      </section>
    );
  }

  if (v?.status === 'mapped' && v.map) {
    const open = v.open !== false;
    return (
      <section className="vp section" aria-label="The views on this question">
        <div className="vp-head">
          <div>
            <div className="eyebrow">Contested · {v.map.views.length} views</div>
            <h2 className="vp-title">How the views split</h2>
          </div>
          <span className="th-spacer" />
          <button className="btn small" onClick={() => setViewsMapOpen(thread.id, !open)}>{open ? 'Hide' : 'Show the views'}</button>
        </div>
        {open && (
          <>
            <div className="vd-embed"><Result map={v.map} embedded ringItems={ringItems} onRingItems={loadRing} /></div>
            <div className="vp-foot">
              <span className="th-hint">{v.map.live
                ? 'Mapped by AI from live web search. It only links pages it found and opened. It doesn’t pick a side, so read the sources themselves.'
                : `Researched in ${v.map.preparedOn || 'November 2026'}. Every link was opened and read. None of the views is marked right or wrong.`}</span>
            </div>
          </>
        )}
      </section>
    );
  }

  // No map: the button, with a word on what the check found, if it ran.
  const note = v?.error
    ? `Couldn’t map the views: ${v.error}`
    : v?.status === 'none'
      ? (v.map?.thin
        ? 'People do disagree on this, but there weren’t enough articles from each side to show it.'
        : 'No public sides to map on this question.')
      : null;
  return (
    <section className="vp vp-quiet">
      <button className="btn small ghost" onClick={() => requestViewsMap(thread.id)}>◐ {v ? 'Try mapping the views again' : 'Show the views'}</button>
      {note && <span className="th-hint vp-note">{note}</span>}
    </section>
  );
}
