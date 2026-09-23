// The thread page (#/t/<id>): one scrolling page you come back to.
// Main column: where the question is now, the open session (or the way to
// start one), the history. Right rail: the reading (correctable) and what
// you've kept.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import '../thread/thread.css';
import * as R from '../../data/record.js';
import * as A from '../../data/actions.js';
import { useRecord, useBusy } from '../../data/hooks.js';
import { SLOTS } from '../../engine/prompts.js';
import { SlotTag, Spinner, timeAgo, hostOf } from '../kit.jsx';
import { go, threadPath } from '../router.js';
import ItemCard, { SkeletonCard, FailedCard, EmptySlotCard, NoteList } from '../thread/ItemCard.jsx';
import Reading from '../thread/Reading.jsx';
import Timeline, { Verdict, Moves } from '../thread/Timeline.jsx';
import { setShared } from '../../data/sharing.js';

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---- Now -----------------------------------------------------------------------
function Now({ thread, parent, sessions, openSession, onRestateInSession }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const cur = R.currentArticulation(thread);
  const closedSessions = sessions.filter((s) => s.closedAt).length;
  const dormant = R.isDormant(thread);
  const status = [];
  status.push(`Started ${timeAgo(thread.createdAt)}`);
  status.push(sessions.length ? plural(sessions.length, 'session') : 'no sessions yet');
  if (thread.articulations.length > 1) status.push(`restated ${thread.articulations.length - 1}×`);
  if (dormant) status.push(`quiet since ${fmtDate(thread.touchedAt || thread.createdAt)}`);

  const startEdit = () => {
    if (openSession) { onRestateInSession(); return; }
    setText(cur); setEditing(true);
  };
  const save = async () => {
    if (!text.trim() || text.trim() === cur) { setEditing(false); return; }
    setSaving(true);
    try { await A.restate(thread.id, text); setEditing(false); } finally { setSaving(false); }
  };

  return (
    <section className="th-now">
      <div className="th-now-meta">
        {parent && (
          <div className="eyebrow th-lineage">
            ↳ from <a href={'#' + threadPath(parent.id)}>{R.currentArticulation(parent)}</a>
            {thread.spawnAnchor?.title && <span className="th-anchor"> · anchored on “{thread.spawnAnchor.url ? <a href={thread.spawnAnchor.url} target="_blank" rel="noopener noreferrer">{thread.spawnAnchor.title}</a> : thread.spawnAnchor.title}”</span>}
          </div>
        )}
        {thread.seed && !thread.parentId && (
          <div className="eyebrow th-seed">
            Held from the Promenade · {thread.seed.url ? <a href={thread.seed.url} target="_blank" rel="noopener noreferrer">{thread.seed.title}</a> : thread.seed.title}
            {thread.seed.source ? <span className="th-anchor"> · {thread.seed.source}</span> : null}
          </div>
        )}
        {!parent && !thread.seed && <div className="eyebrow">{thread.status === 'closed' ? 'Thread · closed' : 'Thread'}</div>}
      </div>

      <div className={`th-now-body ${thread.image?.thumbnail ? 'has-img' : ''}`}>
        {thread.image?.thumbnail && (
          <figure className="th-now-img" title={thread.image.observation || ''}>
            <img src={thread.image.thumbnail} alt="The image this thread started from" />
          </figure>
        )}
        <div className="th-now-text">
          {editing ? (
            <div className="th-now-edit">
              <textarea autoFocus className="field serif th-now-field" rows={3} value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); if (e.key === 'Escape') setEditing(false); }} />
              <div className="th-row">
                <button className="btn small primary" disabled={saving || !text.trim()} onClick={save}>{saving ? <Spinner /> : null}Save restatement</button>
                <button className="btn link" onClick={() => setEditing(false)}>Cancel</button>
                <span className="th-hint">Outside a session this is recorded as a restatement, without a judgement.</span>
              </div>
            </div>
          ) : (
            <h1 className={`th-now-q ${thread.status === 'closed' ? 'closed' : ''}`}>{cur}</h1>
          )}
          <div className="th-now-status">
            <span>{status.join(' · ')}</span>
            {!editing && thread.status !== 'closed' && (
              <button className="btn link th-now-restate" onClick={startEdit}>Restate</button>
            )}
            <button className={`btn link th-share ${thread.shared ? 'on' : ''}`}
              title={thread.shared
                ? 'Others on this Mosaic can read this thread. Click to stop sharing.'
                : 'Let the others on this Mosaic read this thread: its question and history, the reading, finished sessions, and kept items with your notes. Read-only.'}
              onClick={() => setShared(thread.id, !thread.shared)}>
              {thread.shared ? '◉ Shared — stop' : 'Share with others'}
            </button>
          </div>
          {thread.articulations.length > 1 && !editing && (
            <p className="th-first">First held as <span className="serif">“{thread.articulations[0].text}”</span></p>
          )}
          {thread.image?.observation && !editing && <p className={`th-first clamp ${obsOpen ? 'open' : ''}`} onClick={() => setObsOpen((v) => !v)} title="Show all">From an image: {thread.image.observation}</p>}
          {thread.status === 'closed' && (
            <div className="th-synth">
              <div className="label">Closed {thread.closedAt ? fmtDate(thread.closedAt) : ''} · synthesis</div>
              <p>{thread.synthesis || <span className="muted">No synthesis written.</span>}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---- the open session ----------------------------------------------------------
function RestateBox({ thread, session, busy, onDone, boxRef }) {
  const draftKey = 'restate:' + session.id;
  const initial = () => { const d = R.getUI()[draftKey]; return d ? d : { text: session.articulationAtOpen || R.currentArticulation(thread), note: '' }; };
  const [draft, setDraft] = useState(initial);
  const [err, setErr] = useState(null);
  const update = (patch) => setDraft((d) => { const n = { ...d, ...patch }; R.setUI({ [draftKey]: n }); return n; });
  const unchanged = draft.text.trim() === (session.articulationAtOpen || '').trim();
  const submit = async () => {
    if (!draft.text.trim() || busy.judging) return;
    setErr(null);
    try {
      const before = session.articulationAtOpen;
      const diff = await A.restate(thread.id, draft.text, draft.note);
      R.setUI({ [draftKey]: undefined });
      onDone({ diff, before, after: draft.text.trim(), sessionId: session.id });
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="th-restate" ref={boxRef}>
      <label className="th-restate-label" htmlFor="th-restate-text">Where is the question now?</label>
      <p className="th-hint">Edit it as little or as much as it has moved. A rewording is fine; it's recorded as a rewording.</p>
      <textarea id="th-restate-text" className="field serif th-restate-field" rows={3} value={draft.text}
        disabled={busy.judging}
        onChange={(e) => update({ text: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }} />
      <input className="field th-restate-note" value={draft.note} disabled={busy.judging}
        placeholder="A note on the session (optional): what did it, what didn't…"
        onChange={(e) => update({ note: e.target.value })} />
      <div className="th-row th-restate-row">
        <button className="btn primary" disabled={!draft.text.trim() || busy.judging} onClick={submit}>
          {busy.judging ? <><Spinner /> Looking at what changed…</> : 'Restate & close session'}
        </button>
        {unchanged && !busy.judging && <span className="th-hint">Unchanged from the session's start.</span>}
        <span className="th-spacer" />
        {!busy.judging && (
          <button className="btn link" onClick={() => { if (confirm('End this session without restating? The items, signals and notes stay in the record.')) { A.endSessionQuietly(thread.id); onDone(null); } }}>
            End session without restating
          </button>
        )}
      </div>
      {err && !busy.error && <div className="error th-mt8">{err}</div>}
    </div>
  );
}

function SessionPanel({ thread, session, items, busy, ratingsOn, onDone, boxRef }) {
  const filling = busy.filling || new Set();
  const bySlot = {};
  for (const it of items) bySlot[it.slot] = it;
  const missing = SLOTS.filter((s) => !bySlot[s]);
  const anySignal = items.some((i) => i.signal);
  return (
    <section className="th-session section" aria-label="This session">
      <div className="section-head">
        <h2>This session</h2>
        <span className="label">opened {timeAgo(session.openedAt)}</span>
      </div>
      {!anySignal && <p className="th-hint th-session-hint">Open what draws you (it opens in a new tab), mark how each one lands, then say where the question is now.</p>}
      <div className="th-grid">
        {SLOTS.map((slot) => {
          const it = bySlot[slot];
          if (it && !it.failed) return <ItemCard key={it.id} item={it} replacing={filling.has(slot)} ratingsOn={ratingsOn} threadClosed={thread.status === 'closed'} />;
          if (filling.has(slot)) return <SkeletonCard key={slot} slot={slot} />;
          if (it?.failed) return <FailedCard key={slot} slot={slot} error={it.error} busy={filling.size > 0} onRetry={() => A.fillMissing(thread.id)} />;
          return <EmptySlotCard key={slot} slot={slot} />;
        })}
      </div>
      {missing.length > 0 && filling.size === 0 && (
        <div className="th-fillrow">
          <button className="btn" onClick={() => A.fillMissing(thread.id)}>Fill the remaining {missing.length === 1 ? 'slot' : plural(missing.length, 'slot')}</button>
          <span className="th-hint">{missing.join(', ')} {missing.length === 1 ? 'is' : 'are'} still empty.</span>
        </div>
      )}
      <RestateBox thread={thread} session={session} busy={busy} onDone={onDone} boxRef={boxRef} />
    </section>
  );
}

function ResultCard({ result, onDismiss }) {
  const { diff, before, after } = result;
  return (
    <section className="th-result card" aria-live="polite">
      <div className="th-result-head">
        <span className="label">Session closed</span>
        {diff && <Verdict diff={diff} />}
        <span className="th-spacer" />
        <button className="th-x" onClick={onDismiss} title="Dismiss">✕</button>
      </div>
      {before && after && before.trim() !== after.trim() ? (
        <div className="th-tl-diff">
          <p className="th-tl-before">{before}</p>
          <p className="th-tl-after"><span className="th-arrow">→</span> {after}</p>
        </div>
      ) : after ? <p className="serif th-result-q">{after} <span className="muted th-small">(unchanged)</span></p> : null}
      {diff?.why && <p className="th-result-why">{diff.why}</p>}
      <Moves moves={diff?.moves} />
    </section>
  );
}

function NoSession({ thread, sessions, busy }) {
  if (thread.status === 'closed') {
    return (
      <section className="th-nosession section">
        <div className="th-nosession-box">
          <p>This thread is closed. Reopen it to pull a new feed.</p>
          <button className="btn" onClick={() => A.reopenThread(thread.id)}>Reopen thread</button>
        </div>
      </section>
    );
  }
  if (busy.reading && !sessions.length) {
    return (
      <section className="th-nosession section">
        <div className="th-nosession-box quiet"><Spinner /> <span>Reading the question. The first feed fills in right after.</span></div>
      </section>
    );
  }
  return (
    <section className="th-nosession section">
      <div className="th-nosession-box">
        <div>
          <button className="btn primary" disabled={busy.reading} onClick={() => A.newFeed(thread.id)}>New feed</button>
        </div>
        <p className="th-nosession-what">
          Opens a session: four items — one to sharpen, one to complicate, one bridge, one concrete case — composed from where the question is now{sessions.some((s) => s.closedAt) ? ' and from what moved you before' : ''}.
        </p>
      </div>
    </section>
  );
}

// ---- rail: kept ---------------------------------------------------------------
function Kept({ items }) {
  return (
    <section className="th-kept">
      <div className="th-rail-head"><h2 className="th-rail-title">Kept</h2><span className="th-rail-meta">{items.length || ''}</span></div>
      {!items.length ? <p className="muted th-small">Nothing kept yet. ☆ on an item keeps it here; a note keeps it too.</p> : (
        <ul className="th-kept-list">
          {items.map((i) => (
            <li key={i.id} className={`slot-${i.slot}`}>
              <div className="th-kept-top">
                <SlotTag slot={i.slot} />
                <button className="th-keep on small" title="Unkeep" onClick={() => A.toggleKeep(i.id)}>★</button>
              </div>
              <a className="th-kept-title" href={i.url} target="_blank" rel="noopener noreferrer" onClick={() => A.markOpened(i.id)}>{i.title}</a>
              <div className="th-kept-src">{[i.source || hostOf(i.url), fmtDate(i.createdAt)].filter(Boolean).join(' · ')}</div>
              <NoteList item={i} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---- lifecycle -------------------------------------------------------------------
function Lifecycle({ thread, openSession }) {
  const [closing, setClosing] = useState(false);
  const [synth, setSynth] = useState('');
  const close = () => {
    if (openSession) A.endSessionQuietly(thread.id);
    A.closeThread(thread.id, synth);
    setClosing(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const del = () => {
    if (!confirm('Delete this thread, its sessions, items and notes? This cannot be undone.')) return;
    R.deleteThread(thread.id);
    go('/');
  };
  return (
    <section className="th-life">
      {closing ? (
        <div className="th-life-close">
          <label className="th-restate-label" htmlFor="th-synth">Where did it land?</label>
          <p className="th-hint">A few sentences to come back to. You can reopen the thread any time.</p>
          <textarea id="th-synth" autoFocus className="field serif" rows={4} value={synth} onChange={(e) => setSynth(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close(); if (e.key === 'Escape') setClosing(false); }} />
          <div className="th-row">
            <button className="btn primary small" onClick={close}>Close thread</button>
            <button className="btn link" onClick={() => setClosing(false)}>Cancel</button>
            {openSession && <span className="th-hint">The open session ends without a restatement.</span>}
          </div>
        </div>
      ) : (
        <div className="th-life-row">
          {thread.status === 'closed'
            ? <button className="btn link" onClick={() => A.reopenThread(thread.id)}>Reopen this thread</button>
            : <button className="btn link" onClick={() => setClosing(true)}>Close this thread with a synthesis…</button>}
          <span className="th-spacer" />
          <button className="btn link th-danger" onClick={del}>Delete thread</button>
        </div>
      )}
    </section>
  );
}

// ---- page ------------------------------------------------------------------------
export default function ThreadPage({ id }) {
  const busy = useBusy(id);
  const data = useRecord(() => {
    const thread = R.getThread(id);
    if (!thread) return null;
    const sessions = R.sessionsFor(id);
    const openSession = R.openSessionFor(id);
    const items = R.itemsFor(id);
    return {
      thread, sessions, openSession, items,
      sessionItems: openSession ? R.sessionItems(openSession) : [],
      kept: items.filter((i) => i.kept).sort((a, b) => b.createdAt - a.createdAt),
      parent: thread.parentId ? R.getThread(thread.parentId) : null,
      children: R.childrenOf(id),
      ratingsOn: R.getSettings().ratings,
    };
  }, [id]);
  const [result, setResult] = useState(null);
  const boxRef = useRef(null);
  useEffect(() => { if (data?.openSession) setResult(null); }, [data?.openSession?.id]);

  if (!data) return null;
  const { thread, sessions, openSession, items, sessionItems, kept, parent, children, ratingsOn } = data;

  const focusRestate = () => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el.querySelector('textarea')?.focus(), 350);
  };

  return (
    <div className="page wide th-page">
      {busy.error && (
        <div className="error th-error">
          <span>{busy.error}</span>
          <button className="th-x" onClick={() => A.clearError(id)} title="Dismiss">✕</button>
        </div>
      )}
      <div className="th-layout">
        <div className="th-main">
          <div className="th-o-now">
            <Now thread={thread} parent={parent} sessions={sessions} openSession={openSession} onRestateInSession={focusRestate} />
          </div>
          <div className="th-o-session">
            {result && !openSession && <ResultCard result={result} onDismiss={() => setResult(null)} />}
            {openSession
              ? <SessionPanel thread={thread} session={openSession} items={sessionItems} busy={busy} ratingsOn={ratingsOn} onDone={setResult} boxRef={boxRef} />
              : <NoSession thread={thread} sessions={sessions} busy={busy} />}
          </div>
          <div className="th-o-timeline">
            <section className="section th-history">
              <div className="section-head"><h2>History</h2><span className="label">newest first</span></div>
              <Timeline thread={thread} sessions={sessions} items={items} children={children} hideSessionId={result && !openSession ? result.sessionId : null} />
            </section>
            <Lifecycle thread={thread} openSession={openSession} />
          </div>
        </div>
        <aside className="th-rail">
          <div className="th-o-reading">
            <Reading thread={thread} busy={busy} collapsible={sessions.some((s) => s.closedAt)} />
          </div>
          <div className="th-o-kept">
            <Kept items={kept} />
          </div>
        </aside>
      </div>
    </div>
  );
}
