// The views on a thread's question, drawn the way the
// views page draws them: the mandala, the pop-ups with real articles for each
// ring, and each view's case. It replaces the older chart (ViewsPanel.jsx,
// kept for now) in the same spot under the question.
//
// It never maps a question by itself: you press the button. A live test found
// it mapped a four-way controversy onto questions with no public sides at all
// ("How tall is Mount Everest?", "Is taste learnable?"), and most threads here
// open with "teach me…" rather than a contested question. A ready example
// still opens at once. See docs/views-review-2026-11-23.md.
import React, { useCallback } from 'react';
import { useBusy } from '../../data/hooks.js';
import { currentViewsMap, requestViewsMap, setViewsMapOpen, ringItemsFor, requestRingItems } from '../../data/views.js';
import { Result, Working } from '../../viewsdemo/ViewsPage.jsx';
import '../../viewsdemo/viewsdemo.css';
import './views.css';
import { t } from '../../i18n/index.js';

export default function ThreadViews({ thread }) {
  const busy = useBusy(thread.id);
  const v = currentViewsMap(thread);
  const working = busy.viewsMap;
  // A ring with too few checked articles looks for items about its question.
  const loadRing = useCallback((k, opts) => requestRingItems(thread.id, k, opts), [thread.id]);
  const ringItems = (k) => ringItemsFor(thread, k);

  if (thread.status === 'closed') return null;

  if (working) {
    return (
      <section className="vp section" aria-live="polite">
        <div className="vp-head">
          <div>
            <div className="eyebrow">{t('Views')}</div>
            <h2 className="vp-title">{t('Mapping the views on this question')}</h2>
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
      <section className="vp section" aria-label={t('The views on this question')}>
        <div className="vp-head">
          <div>
            <div className="eyebrow">{t('Contested · {n} views', { n: v.map.views.length })}</div>
            <h2 className="vp-title">{t('How the views split')}</h2>
          </div>
          <span className="th-spacer" />
          <button className="btn small" onClick={() => setViewsMapOpen(thread.id, !open)}>{open ? t('Hide') : t('Show the views')}</button>
        </div>
        {open && (
          <>
            <div className="vd-embed"><Result map={v.map} embedded ringItems={ringItems} onRingItems={loadRing} /></div>
            <div className="vp-foot">
              <span className="th-hint">{v.map.live
                ? t('Mapped by AI from live web search. It only links pages it found and opened. It doesn’t pick a side, so read the sources themselves.')
                : t('Researched in {date}. Every link was opened and read. None of the views is marked right or wrong.', { date: v.map.preparedOn || t('November 2026') })}</span>
            </div>
          </>
        )}
      </section>
    );
  }

  // No map: the button, with a word on what the check found, if it ran.
  const note = v?.error
    ? t('Couldn’t map the views: {error}', { error: v.error })
    : v?.status === 'none'
      ? (v.map?.thin
        ? t('People do disagree on this, but there weren’t enough articles from each side to show it.')
        : t('No public sides to map on this question.'))
      : null;
  return (
    <section className="vp vp-quiet">
      <button className="btn small ghost" onClick={() => requestViewsMap(thread.id)}>◐ {v ? t('Try mapping the views again') : t('Show the views')}</button>
      {note && <span className="th-hint vp-note">{note}</span>}
    </section>
  );
}
