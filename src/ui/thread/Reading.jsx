// The reading: what the question takes for granted and what it leaves out.
// Every part can be disagreed with; corrections stick across re-reads.
import React, { useState, useEffect } from 'react';
import * as A from '../../data/actions.js';
import { Spinner, timeAgo } from '../kit.jsx';

function ChipGroup({ threadId, field, label, hint, items, added }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const mine = new Set(added.filter((a) => a.field === field).map((a) => a.text.toLowerCase()));
  const submit = () => { if (text.trim()) A.addToReading(threadId, field, text); setText(''); setAdding(false); };
  return (
    <div className="th-rgroup">
      <div className="th-rgroup-head"><span className="label">{label}</span><span className="th-rgroup-hint">{hint}</span></div>
      <div className="th-chips">
        {items.map((x) => (
          <span key={x} className={`th-chip ${mine.has(x.toLowerCase()) ? 'mine' : ''}`} title={mine.has(x.toLowerCase()) ? 'You added this' : undefined}>
            <span>{x}</span>
            <button className="th-chip-x" aria-label={`Not true of my question: ${x}`} title="Not true of my question"
              onClick={() => A.rejectFromReading(threadId, field, x)}>✕</button>
          </span>
        ))}
        {!items.length && <span className="muted th-none">none</span>}
        {adding ? (
          <span className="th-chip-add">
            <input autoFocus className="th-chip-input" value={text} placeholder={field === 'absent' ? 'something missing…' : 'an assumption…'}
              onChange={(e) => setText(e.target.value)} onBlur={() => (text.trim() ? submit() : setAdding(false))}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setText(''); setAdding(false); } }} />
          </span>
        ) : (
          <button className="th-chip-plus" onClick={() => setAdding(true)}>+ add</button>
        )}
      </div>
    </div>
  );
}

export default function Reading({ thread, busy, collapsible }) {
  const [open, setOpen] = useState(!collapsible);
  useEffect(() => { setOpen(!collapsible); }, [collapsible]);
  const r = thread.reading;
  const corr = thread.corrections || { rejected: [], added: [], note: '' };
  const [note, setNote] = useState(corr.note || '');
  useEffect(() => { setNote(corr.note || ''); }, [corr.note]);
  const [noteOpen, setNoteOpen] = useState(!!corr.note);

  const head = (
    <div className="th-rail-head">
      <h2 className="th-rail-title">Reading</h2>
      <div className="th-rail-tools">
        {r && !busy.reading && <span className="th-rail-meta" title={thread.readAt ? new Date(thread.readAt).toLocaleString() : ''}>{thread.readAt ? timeAgo(thread.readAt) : ''}</span>}
        <button className="btn small ghost" disabled={busy.reading} onClick={() => A.reread(thread.id)} title="Read the thread again from where it is now, keeping your corrections">
          {busy.reading ? <Spinner /> : '↻'} Re-read
        </button>
      </div>
    </div>
  );

  if (busy.reading && !r) {
    return (
      <section className="th-reading">
        {head}
        <div className="th-reading-wait"><Spinner /> Reading the question…</div>
        <div className="th-skel-line w80" /><div className="th-skel-line w60" /><div className="th-skel-line w70" />
      </section>
    );
  }
  if (!r) {
    return (
      <section className="th-reading">
        {head}
        <p className="muted th-small">No reading yet. Re-read to have the question read back to you.</p>
      </section>
    );
  }

  const meta = [r.domain, r.questionType, r.register, r.mode === 'explore' ? 'a brief to explore' : null].filter(Boolean);
  return (
    <section className={`th-reading ${busy.reading ? 'is-busy' : ''}`}>
      {head}
      <div className="th-rmeta">{meta.join(' · ')}</div>

      {!open ? (
        <div className="th-rsummary">
          <p><span className="th-rs-l">Takes for granted</span> {r.presuppositions.join('; ') || '—'}</p>
          <p><span className="th-rs-l">Leaves out</span> {r.absent.join('; ') || '—'}</p>
          <button className="btn link" onClick={() => setOpen(true)}>Show and correct the reading</button>
        </div>
      ) : (
        <>
          <ChipGroup threadId={thread.id} field="presuppositions" label="Takes for granted" hint="✕ if it isn't true of your question"
            items={r.presuppositions || []} added={corr.added || []} />
          <ChipGroup threadId={thread.id} field="absent" label="What's absent" hint="what the question leaves out"
            items={r.absent || []} added={corr.added || []} />
          {r.openingMove && (
            <div className="th-rgroup">
              <div className="th-rgroup-head"><span className="label">Opening move</span></div>
              <p className="th-opening">{r.openingMove}</p>
            </div>
          )}
          {corr.rejected?.length > 0 && (
            <p className="th-rejected"><span className="label">Set aside</span> {corr.rejected.map((x, i) => <s key={i}>{x}</s>)}</p>
          )}
          <div className="th-rgroup">
            {noteOpen ? (
              <>
                <div className="th-rgroup-head"><span className="label">Your note on this reading</span></div>
                <textarea className="field th-rnote" rows={2} value={note} placeholder="What it gets wrong, or what it's missing…"
                  onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (corr.note || '') && A.setReadingNote(thread.id, note.trim())} />
                <div className="th-hint">Saved when you click away. It shapes the next reading and feed.</div>
              </>
            ) : (
              <button className="btn link" onClick={() => setNoteOpen(true)}>+ Your note on this reading</button>
            )}
          </div>
          {collapsible && <button className="btn link th-collapse" onClick={() => setOpen(false)}>Collapse</button>}
        </>
      )}
      {busy.reading && <div className="th-reading-wait small"><Spinner /> Re-reading…</div>}
    </section>
  );
}
