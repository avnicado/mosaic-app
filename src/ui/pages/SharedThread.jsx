import React, { useSyncExternalStore } from 'react';
import '../thread/thread.css';
import { subscribeShared, getSharedVersion, getOthers, othersReady } from '../../data/sharing.js';
import { Verdict, Moves } from '../thread/Timeline.jsx';
import { SlotTag, timeAgo, hostOf } from '../kit.jsx';
import { go } from '../router.js';
import { Icon, MediaChip, OpenButton } from '../icons.jsx';

const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// A thread someone else on this Mosaic chose to share. Read-only.
export default function SharedThread({ userId, id }) {
  useSyncExternalStore(subscribeShared, getSharedVersion);
  const entry = getOthers().find((s) => s.owner.id === userId && s.threadId === id);
  if (!entry) {
    return (
      <div className="page">
        <div className="eyebrow">Shared thread</div>
        <p className="muted">{othersReady() ? 'This thread is no longer shared.' : 'Loading…'}</p>
      </div>
    );
  }
  const s = entry.snapshot || {};
  const arts = s.articulations || [];
  const r = s.reading;
  const holdAsMine = () => go(`/new?text=${encodeURIComponent(s.question || '')}`);
  return (
    <div className="page wide th-page">
      <div className="th-layout">
        <div className="th-main">
          <section className="th-now">
            <div className="eyebrow">{entry.owner.name}'s thread · shared with you · read-only</div>
            <h1 className={`th-now-q ${s.status === 'closed' ? 'closed' : ''}`}>{s.question}</h1>
            <div className="th-now-status">
              <span>Started {s.createdAt ? fmtDate(s.createdAt) : '—'} · {(s.sessions || []).length} finished session{(s.sessions || []).length === 1 ? '' : 's'} · updated {timeAgo(entry.updatedAt)}</span>
              <button className="btn link th-now-restate" onClick={holdAsMine} title="Open your own thread starting from this question">Hold this question yourself →</button>
            </div>
            {arts.length > 1 && <p className="th-first">First held as <span className="serif">“{arts[0].text}”</span></p>}
            {s.seed && <p className="th-first">Started from “{s.seed.title}”{s.seed.source ? ` (${s.seed.source})` : ''}</p>}
            {s.status === 'closed' && (
              <div className="th-synth">
                <div className="label">Closed {s.closedAt ? fmtDate(s.closedAt) : ''} · synthesis</div>
                <p>{s.synthesis || <span className="muted">No synthesis written.</span>}</p>
              </div>
            )}
          </section>

          <section className="section th-history">
            <div className="section-head"><h2>History</h2><span className="label">newest first</span></div>
            {!(s.sessions || []).length && <p className="empty">No finished sessions yet.</p>}
            <ol className="th-tl">
              {(s.sessions || []).slice().reverse().map((ss, i) => (
                <li key={i} className="th-tl-entry">
                  <div className="th-tl-when">{fmtDate(ss.closedAt)}</div>
                  <div>
                    <div className="th-row" style={{ gap: 8, alignItems: 'center' }}><span className="label">Session</span><Verdict diff={ss.diff} /></div>
                    {ss.after ? (
                      <>
                        <p className="muted serif" style={{ margin: '6px 0 2px' }}>{ss.before}</p>
                        <p className="serif" style={{ margin: 0, fontSize: 17 }}><span style={{ color: 'var(--accent)' }}>→ </span>{ss.after}</p>
                      </>
                    ) : <p className="muted" style={{ margin: '6px 0 0' }}>Ended without restating.</p>}
                    {ss.diff?.why && <p className="soft" style={{ margin: '8px 0 0', fontSize: 14 }}>{ss.diff.why}</p>}
                    <Moves moves={ss.diff?.moves} />
                    {(ss.items || []).length > 0 && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
                        {ss.items.map((it, k) => (
                          <li key={k} style={{ fontSize: 14, margin: '3px 0' }}>
                            <span style={{ color: it.signal === 'moved' ? 'var(--accent)' : 'var(--ink-faded)', marginRight: 8 }}><Icon name={it.signal === 'moved' ? 'moved' : 'closed'} size={12} /></span><MediaChip type={it.mediaType} url={it.url} size={13} />{' '}
                            <SlotTag slot={it.slot} />{' '}
                            <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {ss.note && <p className="serif" style={{ fontStyle: 'italic', margin: '8px 0 0', color: 'var(--ink-soft)' }}>“{ss.note}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="th-rail">
          {r && (
            <section>
              <div className="section-head"><h2>Reading</h2></div>
              <p className="soft" style={{ fontSize: 14 }}>{[r.domain, r.questionType, r.register].filter(Boolean).join(' · ')}</p>
              {r.presuppositions?.length > 0 && <p style={{ fontSize: 14 }}><span className="label">Takes for granted </span>{r.presuppositions.join('; ')}</p>}
              {r.absent?.length > 0 && <p style={{ fontSize: 14 }}><span className="label">Leaves out </span>{r.absent.join('; ')}</p>}
            </section>
          )}
          <section className="section">
            <div className="section-head"><h2>Kept</h2><span className="label">{(s.kept || []).length}</span></div>
            {!(s.kept || []).length && <p className="muted" style={{ fontSize: 14 }}>Nothing kept.</p>}
            {(s.kept || []).map((k, i) => (
              <div key={i} style={{ margin: '0 0 14px' }}>
                <SlotTag slot={k.slot} />
                <div className="serif" style={{ fontSize: 15.5, lineHeight: 1.3, margin: '3px 0 2px' }}><a href={k.url} target="_blank" rel="noreferrer">{k.title}</a></div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>{k.source || hostOf(k.url)}</div>
                <OpenButton item={k} compact />
                {(k.notes || []).map((n, j) => <p key={j} style={{ fontSize: 13.5, margin: '4px 0 0', paddingLeft: 10, borderLeft: '2px solid var(--rule)' }}>{n}</p>)}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  );
}
