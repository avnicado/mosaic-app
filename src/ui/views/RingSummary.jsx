// The questions a thread's views split on, one per ring of the mandala, at the
// top of the thread's side column (Gil: "a summary of the questions … where the
// reading of your question currently is"). Tapping one opens that ring.
import React from 'react';
import { currentViewsMap, setViewsMapOpen } from '../../data/views.js';

export const OPEN_RING = 'mosaic:views-ring';

export default function RingSummary({ thread }) {
  const v = currentViewsMap(thread);
  if (thread.status === 'closed' || v?.status !== 'mapped' || !v.map?.cruxes?.length) return null;
  const { map } = v;
  const open = (k) => {
    if (v.open === false) setViewsMapOpen(thread.id, true);
    // Let the views draw (if they were hidden), bring them into view, then open the ring.
    setTimeout(() => {
      document.querySelector('.th-page .vp')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_RING, { detail: { question: map.question, k } })), 450);
    }, 30);
  };
  return (
    <section className="th-rings" aria-labelledby="th-rings-h">
      <div className="th-rail-head">
        <h2 className="th-rail-title" id="th-rings-h">The questions it splits on</h2>
        <span className="th-rail-meta">{map.cruxes.length} rings</span>
      </div>
      <ol className="th-rings-list">
        {map.cruxes.map((c, k) => (
          <li key={k}>
            <button type="button" className="th-ring-q" onClick={() => open(k)} title="Open this ring">
              <span className="th-ring-n">{k + 1}</span>
              <span className="th-ring-text">
                <span className="th-ring-question">{c.question}</span>
                <span className="th-ring-ans">{c.left} · {c.right}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="th-rings-hint">Ring 1 is the innermost. Tap one for articles on each side.</p>
    </section>
  );
}
