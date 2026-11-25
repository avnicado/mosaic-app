// The views on a thread's question (admin only for now): the automatic
// "is this contested?" check, the manual "Show the views" button, and the
// mandala when there is one. Renders nothing for anyone but the admin.
import React, { useEffect } from 'react';
import { isOwner } from '../../session.js';
import { useBusy } from '../../data/hooks.js';
import { currentViews, wantsAutoCheck, requestViews, setViewsOpen } from '../../data/views.js';
import { Spinner } from '../kit.jsx';
import ViewsMandala from './ViewsMandala.jsx';
import './views.css';
import { t, loc } from '../../i18n/index.js';

export default function ViewsPanel({ thread }) {
  const admin = isOwner();
  const busy = useBusy(thread.id);
  const v = currentViews(thread);
  const working = busy.views;
  const otherWork = busy.reading || busy.judging || (busy.filling && busy.filling.size > 0);

  // The automatic check: a new wording, once, after the reading and the feed.
  useEffect(() => {
    if (!admin || working || otherWork) return;
    if (wantsAutoCheck(thread) && thread.reading) requestViews(thread.id);
  }, [admin, thread.id, thread.articulations?.length, !!thread.reading, !!otherWork, !!working]);

  if (!admin || thread.status === 'closed') return null;

  const show = () => requestViews(thread.id, { force: true });
  const tag = <span className="vp-admin" title={t('Only the admin sees this for now')}>{t('admin')}</span>;

  if (working) {
    return (
      <section className="vp vp-quiet" aria-live="polite">
        <Spinner /> <span>{working === 'map' ? t('Mapping the views on this question and finding someone who holds each one…') : t('Checking whether this question is contested…')}</span>
        {tag}
      </section>
    );
  }

  if (v?.status === 'divisive' && v.views?.length) {
    return (
      <section className="vp section" aria-label={t('The views on this question')}>
        <div className="vp-head">
          <div>
            <div className="eyebrow">{t('Contested')}{v.topic ? ` · ${v.topic}` : ''}</div>
            <h2 className="vp-title">{t('How the views split')}</h2>
          </div>
          <span className="th-spacer" />
          {tag}
          <button className="btn small" onClick={() => setViewsOpen(thread.id, !v.open)}>{v.open ? t('Hide') : t('Show the views')}</button>
        </div>
        {v.open && (
          <>
            <p className="vp-why">
              {v.why} {t('Each slice is a view and each ring a crux: a specific claim the views answer differently, not a value they all say they hold.')}
              {v.leanWhy ? ` ${v.leanWhy}` : ''}
            </p>
            <ViewsMandala map={v} />
            {v.settled?.length > 0 && (
              <p className="vp-settled"><span className="label">{t('Not in dispute')}</span> {v.settled.join(' · ')}</p>
            )}
            <div className="vp-foot">
              <span className="th-hint">{t('Mapped {date} for this wording. A machine reading: check the pieces themselves.', { date: new Date(v.at).toLocaleDateString(loc(), { month: 'short', day: 'numeric' }) })}</span>
            </div>
          </>
        )}
      </section>
    );
  }

  // No map: the button, with a word on what the check found, if it ran.
  const note = v?.error
    ? t('Couldn’t map the views: {error}', { error: v.error })
    : v?.status === 'settled'
      ? t('No sides to map: the core of this is settled. {why}', { why: v.why || '' })
      : v?.status === 'not' && v.force
        ? t('No real public sides came up. {why}', { why: v.why || '' })
        : null;
  return (
    <section className="vp vp-quiet">
      <button className="btn small ghost" onClick={show}>◐ {t('Show the views')}</button>
      {note && <span className="th-hint vp-note">{note}</span>}
      {tag}
    </section>
  );
}
