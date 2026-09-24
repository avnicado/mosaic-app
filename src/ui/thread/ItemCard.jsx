// One placed item in the current session: slot + why on the card, where it
// came from, and everything you can do with it (signal, keep, note, rate,
// swap, pursue).
import React, { useState, useRef, useEffect } from 'react';
import * as A from '../../data/actions.js';
import { SlotTag, Spinner, hostOf, RATING_AXES } from '../kit.jsx';
import { go, threadPath } from '../router.js';
import { Icon, MediaChip, OpenButton, readerClick } from '../icons.jsx';
import { mediaInfo } from '../../media.js';

const SIGNALS = [
  { key: 'moved', label: 'moved me' },
  { key: 'neutral', label: 'neutral' },
  { key: 'closed', label: 'closed it down' },
];

export function Provenance({ item }) {
  const bits = [];
  if (item.provenance === 'knowledge') bits.push(<span key="p" title="Chosen from what the model knows, not from a live search">from Wikipedia</span>);
  if (item.linkCheck === 'ok') bits.push(<span key="l" className="th-ok" title="The link was checked and loads">link ✓</span>);
  else bits.push(<span key="l" className="th-unconf" title="The link couldn't be checked; it may not load">link unconfirmed</span>);
  return <span className="th-prov">{bits.reduce((acc, b, i) => (i ? [...acc, <span key={'s' + i} className="th-dot">·</span>, b] : [b]), [])}</span>;
}

function useAutoFocus(on) {
  const ref = useRef(null);
  useEffect(() => { if (on && ref.current) ref.current.focus(); }, [on]);
  return ref;
}

export function RatingRow({ item, compact = false }) {
  const r = item.rating || {};
  return (
    <div className={`th-rate ${compact ? 'compact' : ''}`}>
      {RATING_AXES.map((ax) => (
        <div className="th-rate-axis" key={ax.key}>
          <span className="th-rate-label">{ax.label}</span>
          <span className="th-rate-dots" role="radiogroup" aria-label={ax.label}>
            {[1, 2, 3, 4].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={(r[ax.key] || 0) === v}
                className={`th-rdot ${(r[ax.key] || 0) >= v ? 'on' : ''}`}
                title={`${ax.label}: ${v} of 4`}
                onClick={() => A.setRating(item.id, ax.key, (r[ax.key] || 0) === v ? 0 : v)} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function NoteList({ item }) {
  if (!item.notes?.length) return null;
  return (
    <ul className="th-notes">
      {item.notes.map((n) => (
        <li key={n.at}>
          <span className="th-note-text">{n.text}</span>
          <button className="th-x" title="Remove this note" onClick={() => A.removeNote(item.id, n.at)}><Icon name="x" size={12} /></button>
        </li>
      ))}
    </ul>
  );
}

export default function ItemCard({ item, replacing, ratingsOn, threadClosed }) {
  const [panel, setPanel] = useState(null); // 'note' | 'rate' | 'pursue'
  const [note, setNote] = useState('');
  const [pursue, setPursue] = useState('');
  const [spawning, setSpawning] = useState(false);
  const noteRef = useAutoFocus(panel === 'note');
  const pursueRef = useAutoFocus(panel === 'pursue');
  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));
  const host = hostOf(item.url);
  const rated = item.rating && Object.values(item.rating).some((v) => v > 0);

  const saveNote = () => { if (!note.trim()) return; A.addNote(item.id, note); setNote(''); setPanel(null); };
  const doPursue = async () => {
    if (!pursue.trim()) return;
    setSpawning(true);
    try { const id = await A.spawnFromItem(item.id, pursue); go(threadPath(id)); }
    catch (e) { setSpawning(false); alert(e.message); }
  };

  return (
    <article className={`th-card slot-${item.slot} ${item.signal ? 'sig-' + item.signal : ''} ${replacing ? 'replacing' : ''}`}>
      <header className="th-card-head">
        <SlotTag slot={item.slot} blurb />
        <button className={`th-keep ${item.kept ? 'on' : ''}`} onClick={() => A.toggleKeep(item.id)}
          title={item.kept ? 'Kept — click to unkeep' : 'Keep this item'} aria-pressed={!!item.kept}>
          <Icon name={item.kept ? 'kept' : 'keep'} size={15} /><span className="th-keep-l">{item.kept ? 'Kept' : 'Keep'}</span>
        </button>
      </header>

      <div className="th-card-kind">
        <MediaChip type={item.mediaType} url={item.url} label />
        {item.openedAt ? <span className="th-opened">opened {new Date(item.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}
      </div>
      <h3 className="th-card-title">
        <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={readerClick(item, () => A.markOpened(item.id))}>{item.title}</a>
      </h3>
      <div className="th-card-src">
        {[item.source, host && host !== (item.source || '').toLowerCase() ? host : null].filter(Boolean).join(' · ')}
      </div>
      {item.preview && <p className="th-card-preview">{item.preview}</p>}
      <div className="th-card-open">
        <OpenButton item={item} onOpen={() => A.markOpened(item.id)} />
      </div>
      <div className="th-why"><span className="th-why-l">Why here</span>{item.why}</div>
      <div className="th-card-prov"><Provenance item={item} /></div>

      <div className="th-signals" role="group" aria-label="How did this land?">
        {SIGNALS.map((s) => (
          <button key={s.key} className={`th-sig th-sig-${s.key} ${item.signal === s.key ? 'on' : ''}`}
            aria-pressed={item.signal === s.key} onClick={() => A.setSignal(item.id, s.key)}>
            <Icon name={s.key} size={13} className="th-sig-g" /> {s.label}
          </button>
        ))}
      </div>

      <NoteList item={item} />
      {rated && panel !== 'rate' && ratingsOn && (
        <button className="th-rated" onClick={() => toggle('rate')} title="Edit rating">
          {RATING_AXES.filter((a) => item.rating[a.key] > 0).map((a) => `${a.label.split(' ')[0].toLowerCase()} ${item.rating[a.key]}`).join(' · ')}
        </button>
      )}

      <div className="th-actions">
        <button className={`th-act ${panel === 'note' ? 'on' : ''}`} onClick={() => toggle('note')}><Icon name="note" size={14} /> Note</button>
        {ratingsOn && <button className={`th-act ${panel === 'rate' ? 'on' : ''}`} onClick={() => toggle('rate')}><Icon name="rate" size={14} /> Rate</button>}
        {!threadClosed && <button className="th-act" disabled={replacing} onClick={() => A.replaceItem(item.id)} title="Swap in a different item for this slot"><Icon name="swap" size={14} /> Different item</button>}
        <span className="th-act-spacer" />
        <button className={`th-act th-pursue ${panel === 'pursue' ? 'on' : ''}`} onClick={() => toggle('pursue')} title="Start a new thread from this item"><Icon name="pursue" size={14} /> Pursue</button>
      </div>

      {panel === 'note' && (
        <div className="th-panel">
          <textarea ref={noteRef} className="field th-note-field" rows={3} value={note} placeholder="What does this make you think? (Saving a note also keeps the item.)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(); if (e.key === 'Escape') setPanel(null); }} />
          <div className="th-panel-row">
            <button className="btn small" disabled={!note.trim()} onClick={saveNote}>Save note</button>
            <button className="btn link" onClick={() => setPanel(null)}>Cancel</button>
            <span className="th-hint">⌘↵</span>
          </div>
        </div>
      )}
      {panel === 'rate' && ratingsOn && (
        <div className="th-panel"><RatingRow item={item} /><div className="th-panel-row"><button className="btn link" onClick={() => setPanel(null)}>Done</button></div></div>
      )}
      {panel === 'pursue' && (
        <div className="th-panel">
          <label className="th-panel-label" htmlFor={'p' + item.id}>What's the question this opens?</label>
          <textarea id={'p' + item.id} ref={pursueRef} className="field serif th-pursue-field" rows={2} value={pursue}
            onChange={(e) => setPursue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doPursue(); if (e.key === 'Escape') setPanel(null); }} />
          <div className="th-panel-row">
            <button className="btn small primary" disabled={!pursue.trim() || spawning} onClick={doPursue}>{spawning ? <Spinner /> : null} Start the thread</button>
            <button className="btn link" onClick={() => setPanel(null)}>Cancel</button>
            <span className="th-hint">It keeps a link back to this thread.</span>
          </div>
        </div>
      )}

      {replacing && <div className="th-card-veil"><Spinner /> finding a different {item.slot} item…</div>}
    </article>
  );
}

export function SkeletonCard({ slot }) {
  return (
    <article className={`th-card th-skel slot-${slot}`} aria-busy="true">
      <header className="th-card-head"><SlotTag slot={slot} blurb /></header>
      <div className="th-skel-msg"><Spinner /> finding a {slot} item…</div>
      <div className="th-skel-line w80" /><div className="th-skel-line w60" /><div className="th-skel-line w90" /><div className="th-skel-line w40" />
    </article>
  );
}

export function FailedCard({ slot, error, onRetry, busy }) {
  return (
    <article className={`th-card th-failed slot-${slot}`}>
      <header className="th-card-head"><SlotTag slot={slot} blurb /></header>
      <p className="th-failed-msg">Couldn't find a {slot} item this time.</p>
      {error && <p className="th-failed-err">{String(error).slice(0, 160)}</p>}
      <div><button className="btn small" disabled={busy} onClick={onRetry}>Try again</button></div>
    </article>
  );
}

export function EmptySlotCard({ slot }) {
  return (
    <article className={`th-card th-emptyslot slot-${slot}`}>
      <header className="th-card-head"><SlotTag slot={slot} blurb /></header>
      <p className="muted th-empty-msg">Not filled yet.</p>
    </article>
  );
}
