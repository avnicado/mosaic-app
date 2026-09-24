// One Promenade card. Used full-size on the Promenade and compact on the Desk.
import '../pages/promenade.css';
import React, { useEffect, useRef, useState } from 'react';
import { SlotTag, hostOf } from '../kit.jsx';
import { MediaChip, OpenButton } from '../icons.jsx';
import { go, threadPath } from '../router.js';
import { holdItem } from '../../data/actions.js';
import { useRecord } from '../../data/hooks.js';
import * as R from '../../data/record.js';
import { cleanExcerpt, realWhy, holdPlaceholder } from './shelf.js';

// The thread this card already seeded, if any.
function useHeldBy(card) {
  return useRecord(() => {
    const t = R.allThreads().find((x) => x.seed && (card.url ? x.seed.url === card.url : x.seed.title === card.title));
    return t ? { id: t.id, text: R.currentArticulation(t) } : null;
  }, [card.url, card.title]);
}

export default function ShelfCard({ card, compact = false, dev = false, startHolding = false }) {
  const excerpt = cleanExcerpt(card.excerpt);
  const why = card.editorial ? card.why : realWhy(card);
  const heldBy = useHeldBy(card);
  const [holding, setHolding] = useState(startHolding);
  const host = card.url ? hostOf(card.url) : '';
  const squash = (x) => (x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const hostSaysSource = host && squash(card.source).length >= 4 && squash(host).includes(squash(card.source).replace(/magazine$/, '').slice(0, 8));
  const source = card.editorial ? '' : [card.source, host && !hostSaysSource ? host : ''].filter(Boolean).join(' · ');

  return (
    <article className={`pm-card ${compact ? 'compact' : ''} ${card.editorial ? 'editorial' : ''}`}>
      <div className="pm-card-top">
        <SlotTag slot={card.slot} />
        {card.url && <MediaChip type={card.mediaType} url={card.url} size={13} />}
        <span className="pm-domain">{card.domain}</span>
      </div>
      <h3 className="pm-title">
        {card.url
          ? <a href={card.url} target="_blank" rel="noopener noreferrer">{card.title}</a>
          : card.title}
      </h3>
      {source && <div className="pm-source">{source}</div>}
      {excerpt && <p className="pm-excerpt">{excerpt}</p>}
      {why && <p className="pm-why"><span className="label">why here</span> {why}</p>}
      {dev && card.scores && (
        <div className="pm-dev">bridging {card.scores.bridging} · engagement {card.scores.engagement} · {card.scored_by}{card.tieBrokenByEngagement ? ' · tie-broken' : ''}</div>
      )}
      <div className="pm-foot">
        {card.url && <OpenButton item={card} compact />}
        {heldBy ? (
          <a className="pm-held" href={'#' + threadPath(heldBy.id)}>You hold this <span className="pm-held-q">— {heldBy.text}</span> →</a>
        ) : compact ? (
          <a className="btn small ghost" href={`#/promenade?hold=${encodeURIComponent(card.url || card.id)}`}>Hold this</a>
        ) : !holding ? (
          <button className="btn small" onClick={() => setHolding(true)}>Hold this</button>
        ) : (
          <HoldComposer card={{ ...card, excerpt }} onCancel={() => setHolding(false)} />
        )}
      </div>
    </article>
  );
}

export function HoldComposer({ card, onCancel }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const id = await holdItem(card, text.trim());
      go(threadPath(id));
    } catch (e2) {
      setErr(e2.message || String(e2)); setBusy(false);
    }
  };
  return (
    <form className="pm-hold" onSubmit={submit}>
      <label className="pm-hold-label" htmlFor={`hold-${card.id}`}>What caught you? Put it as a question, a hunch, or “show me…”</label>
      <textarea id={`hold-${card.id}`} ref={ref} className="field serif pm-hold-field" rows={3} value={text}
        placeholder={holdPlaceholder(card)} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e); if (e.key === 'Escape') onCancel(); }} />
      {err && <div className="error">{err}</div>}
      <div className="pm-hold-actions">
        <button type="submit" className="btn primary small" disabled={!text.trim() || busy}>{busy ? 'Starting…' : 'Start the thread'}</button>
        <button type="button" className="btn link" onClick={onCancel}>Cancel</button>
        {!text.trim() && <span className="muted pm-hold-hint">A thread starts from your words, not the card’s.</span>}
      </div>
    </form>
  );
}

export function ShelfSkeleton({ sections = 3, perSection = 3, compact = false }) {
  return (
    <div className="pm-skeleton" aria-hidden>
      {Array.from({ length: sections }).map((_, s) => (
        <div key={s} className={compact ? '' : 'pm-section'}>
          {!compact && <div className="pm-sk-line" style={{ width: 160, height: 14, marginBottom: 18 }} />}
          <div className={compact ? 'pm-grid compact' : 'pm-grid'}>
            {Array.from({ length: perSection }).map((__, i) => (
              <div key={i} className={`pm-card pm-sk ${compact ? 'compact' : ''}`}>
                <div className="pm-sk-line" style={{ width: '30%' }} />
                <div className="pm-sk-line tall" style={{ width: '90%' }} />
                <div className="pm-sk-line tall" style={{ width: '65%' }} />
                {!compact && <div className="pm-sk-line" style={{ width: '95%', marginTop: 14 }} />}
                {!compact && <div className="pm-sk-line" style={{ width: '80%' }} />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
