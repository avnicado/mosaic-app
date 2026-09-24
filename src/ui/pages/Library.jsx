import React, { useMemo, useState } from 'react';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { go, threadPath } from '../router.js';
import { SlotTag, hostOf, timeAgo } from '../kit.jsx';
import ReadingMosaic from '../mosaic/ReadingMosaic.jsx';
import { MediaChip, OpenButton, Icon, readerClick } from '../icons.jsx';
import {
  snapshot, weekGrid, slotSignals, recurring, corrections, verdicts,
  SLOT_ORDER, joinWords, cap, fmtDate,
} from '../library/derive.js';
import './library.css';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const openThread = (id) => go(threadPath(id));
const ThreadLink = ({ t, className = '' }) => (
  <a className={`lib-tlink ${className}`} href={'#' + threadPath(t.id)}>{R.currentArticulation(t)}</a>
);

export default function Library() {
  const rec = useRecord(snapshot);
  const { threads, sessions, items } = rec;

  if (!threads.length) {
    return (
      <div className="page wide lib">
        <div className="eyebrow">Library</div>
        <h1>Library</h1>
        <p className="lib-empty">Nothing to mirror yet. <a href="#/new">Start a thread</a>.</p>
      </div>
    );
  }

  const active = threads.filter((t) => t.status === 'active' && !R.isDormant(t)).length;
  const quiet = threads.filter((t) => R.isDormant(t)).length;
  const closed = threads.filter((t) => t.status === 'closed');
  const since = Math.min(...threads.map((t) => t.createdAt || Date.now()));

  return (
    <div className="page wide lib">
      <div className="eyebrow">Library</div>
      <h1>Your record</h1>
      <p className="lib-sub">
        {plural(threads.length, 'thread')} since {fmtDate(since, { year: 'numeric' })}:{' '}
        {[active && `${active} active`, quiet && `${quiet} quiet`, closed.length && `${closed.length} closed`].filter(Boolean).join(', ')}.
        {' '}A mirror of what you've done, for you only.
      </p>
      <nav className="lib-toc" aria-label="On this page">
        <a href="#/library" onClick={(e) => jump(e, 'lib-mosaic')}>Mosaic</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-threads')}>Threads</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-weeks')}>Weeks</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-move')}>How you move</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-kept')}>Kept</a>
        {closed.length > 0 && <a href="#/library" onClick={(e) => jump(e, 'lib-closed')}>Closed</a>}
      </nav>

      <MosaicSection threads={threads} items={items} />
      <ThreadsSection threads={threads} sessions={sessions} />
      <WeeksSection rec={rec} />
      <MoveSection threads={threads} sessions={sessions} items={items} />
      <KeptSection threads={threads} items={items} />
      {closed.length > 0 && <ClosedSection closed={closed} sessions={sessions} />}
    </div>
  );
}

function jump(e, id) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- 1. mosaic -------------------------------------------------------------------
function MosaicSection({ threads, items }) {
  return (
    <section className="section" id="lib-mosaic">
      <div className="section-head"><h2>Mosaic</h2><span className="label">what you've read and seen</span></div>
      <ReadingMosaic threads={threads} items={items} />
    </section>
  );
}

// Which threads really moved: one line per thread, real / cosmetic / not judged.
function ThreadsSection({ threads, sessions }) {
  const rows = [...threads].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).map((t) => {
    const done = sessions.filter((s) => s.threadId === t.id && s.closedAt);
    const real = done.filter((s) => s.diff?.verdict === 'real').length;
    const cos = done.filter((s) => s.diff?.verdict === 'cosmetic').length;
    return { t, n: done.length, real, cos, un: done.length - real - cos };
  });
  return (
    <section className="section" id="lib-threads">
      <div className="section-head"><h2>Threads</h2><span className="label">did the question move?</span></div>
      <ul className="lib-panels">
        {rows.map(({ t, n, real, cos, un }) => (
          <li key={t.id}>
            <span className={`lib-panel-dot ${real ? 'real' : ''}`} title={real ? 'really moved at least once' : 'not yet really moved'} />
            <span>
              <ThreadLink t={t} className={t.status === 'closed' ? 'closed' : ''} />
              <span className="lib-panel-meta">
                {n ? [real && `${real} real`, cos && `${cos} cosmetic`, un && `${un} not judged`].filter(Boolean).join(' · ') : 'no finished session'}
                {t.status === 'closed' && ' · closed'}{R.isDormant(t) && ' · quiet'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- 2. weeks --------------------------------------------------------------------
function tone(a) { return a === 0 ? 0 : a <= 2 ? 1 : a <= 5 ? 2 : 3; }

function cellWords(c) {
  const parts = [];
  if (c.sessions) parts.push(plural(c.sessions, 'session') + ' opened');
  if (c.marked) parts.push(`${plural(c.marked, 'item')} marked${c.moved ? ` (${c.moved} ✦)` : ''}`);
  if (c.restated) parts.push(plural(c.restated, 'restatement'));
  if (c.real) parts.push(c.real === 1 ? 'real movement' : `${c.real} real movements`);
  if (c.cosmetic) parts.push(c.cosmetic === 1 ? 'a cosmetic restatement' : `${c.cosmetic} cosmetic`);
  if (c.kept) parts.push(`${c.kept} kept`);
  if (c.created) parts.push('thread started');
  if (c.closedThread) parts.push('thread closed');
  return parts.length ? parts.join(' · ') : 'nothing';
}

function WeeksSection({ rec }) {
  const { weeks, rows } = useMemo(() => weekGrid(rec, 16), [rec]);
  const [tip, setTip] = useState(null);
  const shown = rows.filter((r) => r.any);
  const hidden = rows.length - shown.length;
  const months = weeks.map((w, i) => {
    const m = new Date(w).getMonth();
    return i === 0 || m !== new Date(weeks[i - 1]).getMonth() ? new Date(w).toLocaleDateString(undefined, { month: 'short' }) : '';
  });
  const onEnter = (e, r, c) => {
    const box = e.currentTarget.closest('.lib-weeks').getBoundingClientRect();
    const cb = e.currentTarget.getBoundingClientRect();
    setTip({
      x: Math.min(Math.max(cb.left - box.left + cb.width / 2, 110), box.width - 110),
      y: cb.top - box.top,
      title: R.currentArticulation(r.thread),
      week: `Week of ${fmtDate(c.start)}`,
      body: cellWords(c),
    });
  };
  return (
    <section className="section" id="lib-weeks">
      <div className="section-head"><h2>Weeks</h2><span className="label">last 16 weeks</span></div>
      {!shown.length ? (
        <p className="muted">No activity in the last 16 weeks.</p>
      ) : (
        <div className="lib-weeks" onMouseLeave={() => setTip(null)}>
          <div className="lib-wk-row lib-wk-head" aria-hidden="true">
            <span className="lib-wk-label" />
            {months.map((m, i) => <span key={i} className="lib-wk-month">{m}</span>)}
          </div>
          {shown.map((r) => (
            <div className="lib-wk-row" key={r.thread.id} onClick={() => openThread(r.thread.id)}>
              <a className={`lib-wk-label ${r.thread.status === 'closed' ? 'closed' : ''}`} href={'#' + threadPath(r.thread.id)}
                onClick={(e) => e.stopPropagation()}>
                {R.currentArticulation(r.thread)}
              </a>
              {r.cells.map((c, i) => (
                <span key={i}
                  className={`lib-wk-cell t${tone(c.activity)}${c.real ? ' real' : ''}${c.closedThread ? ' shut' : ''}`}
                  onMouseEnter={(e) => onEnter(e, r, c)}
                  aria-label={`Week of ${fmtDate(c.start)}: ${cellWords(c)}`} />
              ))}
            </div>
          ))}
          {tip && (
            <div className="lib-tip" style={{ left: tip.x, top: tip.y }}>
              <div className="lib-tip-week">{tip.week}</div>
              <div className="lib-tip-title">{tip.title}</div>
              <div>{tip.body}</div>
            </div>
          )}
          <div className="lib-wk-legend">
            <span><i className="lib-wk-cell t1" /> 1–2</span>
            <span><i className="lib-wk-cell t2" /> 3–5</span>
            <span><i className="lib-wk-cell t3" /> 6+ sessions, marks and restatements</span>
            {shown.some((r) => r.cells.some((c) => c.real)) && <span><i className="lib-wk-cell t1 real" /> a session that really moved the question</span>}
            {shown.some((r) => r.cells.some((c) => c.closedThread)) && <span><i className="lib-wk-cell t1 shut" /> the week a thread was closed</span>}
          </div>
          {hidden > 0 && <p className="lib-note">{plural(hidden, 'thread')} with nothing in these weeks {hidden === 1 ? 'is' : 'are'} left out.</p>}
        </div>
      )}
    </section>
  );
}

// ---- 3. how you move -------------------------------------------------------------
function MoveSection({ threads, sessions, items }) {
  const slots = useMemo(() => slotSignals(items), [items]);
  const pres = useMemo(() => recurring(threads, 'presuppositions'), [threads]);
  const abs = useMemo(() => recurring(threads, 'absent'), [threads]);
  const corr = useMemo(() => corrections(threads), [threads]);
  const v = useMemo(() => verdicts(sessions), [sessions]);

  const maxMoved = Math.max(...SLOT_ORDER.map((s) => slots[s].moved));
  const maxClosed = Math.max(...SLOT_ORDER.map((s) => slots[s].closed));
  const maxMarked = Math.max(1, ...SLOT_ORDER.map((s) => slots[s].moved + slots[s].neutral + slots[s].closed));
  const top = SLOT_ORDER.filter((s) => maxMoved > 0 && slots[s].moved === maxMoved);
  const shut = SLOT_ORDER.filter((s) => maxClosed > 0 && slots[s].closed === maxClosed);

  return (
    <section className="section" id="lib-move">
      <div className="section-head"><h2>How you move</h2><span className="label">across every thread</span></div>
      <div className="lib-move">
        <div>
          <h3 className="lib-h">What moved you, by slot</h3>
          <p className="lib-lead">
            {top.length
              ? <>{cap(joinWords(top))} items have moved you most{top.length > 1 ? ', equally' : ''}.</>
              : 'You haven’t marked anything ✦ moved me yet.'}
            {shut.length > 0 && <> {cap(joinWords(shut))} {shut.length > 1 ? 'are' : 'is'} where you’ve most often marked – closed it down.</>}
          </p>
          <div className="lib-slots" role="table" aria-label="Marks per slot">
            {SLOT_ORDER.map((s) => {
              const o = slots[s];
              const w = (n) => `${(n / maxMarked) * 100}%`;
              return (
                <div className="lib-slot-row" role="row" key={s}>
                  <span role="cell" className="lib-slot-name"><SlotTag slot={s} /></span>
                  <span role="cell" className={`lib-slot-bar slot-${s}`} aria-hidden="true">
                    {o.moved > 0 && <i className="m" style={{ width: w(o.moved) }} />}
                    {o.neutral > 0 && <i className="n" style={{ width: w(o.neutral) }} />}
                    {o.closed > 0 && <i className="c" style={{ width: w(o.closed) }} />}
                  </span>
                  <span role="cell" className="lib-slot-nums">✦ {o.moved} · ○ {o.neutral} · – {o.closed} <span className="muted">of {o.shown}</span></span>
                </div>
              );
            })}
          </div>
          <p className="lib-note">✦ moved me · ○ neutral · – closed it down, out of every item placed in that slot.</p>
        </div>

        <div>
          <h3 className="lib-h">Restatements</h3>
          {v.finished ? (
            <>
              <p className="lib-lead">
                Of {plural(v.finished, 'finished session')}, {v.real} really moved the question, {v.cosmetic} {v.cosmetic === 1 ? 'was' : 'were'} rewording
                {v.unjudged ? `, and ${v.unjudged} ended without a restatement` : ''}.
                {v.open ? ` ${plural(v.open, 'session')} ${v.open === 1 ? 'is' : 'are'} still open.` : ''}
              </p>
              {v.moves.length > 0 && (
                <>
                  <div className="label lib-mini">Kinds of movement named</div>
                  <ul className="lib-plain">
                    {v.moves.slice(0, 6).map(([label, n]) => <li key={label}>{label}{n > 1 && <span className="muted"> ×{n}</span>}</li>)}
                  </ul>
                </>
              )}
            </>
          ) : <p className="muted">No session has finished yet.</p>}
        </div>

        <div>
          <h3 className="lib-h">What the readings keep finding</h3>
          <Recurring title="Taken for granted in more than one thread" groups={pres}
            none="No presupposition has come up in more than one thread yet." />
          <Recurring title="Said to be missing in more than one thread" groups={abs}
            none="No absence has come up in more than one thread yet." />
        </div>

        <div>
          <h3 className="lib-h">Your corrections</h3>
          {corr.rejected + corr.addedPre + corr.addedAbsent + corr.notes === 0 ? (
            <p className="muted">You haven’t corrected a reading yet.</p>
          ) : (
            <>
              <p className="lib-lead">
                {[
                  corr.rejected && `You’ve rejected ${plural(corr.rejected, 'thing')} a reading claimed`,
                  corr.addedPre && `added ${plural(corr.addedPre, 'presupposition')} it missed`,
                  corr.addedAbsent && `named ${corr.addedAbsent} ${corr.addedAbsent === 1 ? 'thing' : 'things'} it left out`,
                  corr.notes && `left a note on ${plural(corr.notes, 'reading')}`,
                ].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}.
              </p>
              <ul className="lib-corr">
                {corr.recent.map((c, i) => (
                  <li key={i}>
                    <span className={`lib-corr-kind k-${c.kind}`}>{{ rejected: 'rejected', 'added-pre': 'added', 'added-absent': 'missing', note: 'note' }[c.kind]}</span>
                    <span>
                      <span className="lib-corr-text">{c.text}</span>
                      <ThreadLink t={c.thread} className="lib-corr-thread" />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Recurring({ title, groups, none }) {
  return (
    <div className="lib-rec">
      <div className="label lib-mini">{title}</div>
      {groups.length ? (
        <ul className="lib-plain">
          {groups.slice(0, 6).map((g) => (
            <li key={g.text}>
              <span className="serif">{g.text}</span>{' '}
              <span className="muted">· {g.threads.length} threads{g.rejectedElsewhere ? ' · you’ve rejected this before' : ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted lib-small">{none}</p>}
    </div>
  );
}

// ---- 4. kept -----------------------------------------------------------------------
function KeptSection({ threads, items }) {
  const [filter, setFilter] = useState('all');
  const kept = items.filter((i) => i.kept);
  const withNotes = kept.filter((i) => (i.notes || []).length);
  const list = filter === 'notes' ? withNotes : kept;
  const groups = threads
    .map((t) => ({ t, items: list.filter((i) => i.threadId === t.id).sort((a, b) => b.createdAt - a.createdAt) }))
    .filter((g) => g.items.length);
  return (
    <section className="section" id="lib-kept">
      <div className="section-head">
        <h2>Kept</h2>
        {kept.length > 0 && (
          <div className="lib-filter" role="group" aria-label="Filter kept items">
            <button className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All · {kept.length}</button>
            <button className={filter === 'notes' ? 'on' : ''} aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>With notes · {withNotes.length}</button>
          </div>
        )}
      </div>
      {!kept.length ? <p className="muted">Nothing kept yet. Keep an item from a feed and it shows up here.</p>
        : !groups.length ? <p className="muted">No kept item has a note yet.</p>
        : groups.map(({ t, items: its }) => (
          <div className="lib-kept-group" key={t.id}>
            <ThreadLink t={t} className="lib-kept-thread" />
            <ul className="lib-kept-list">
              {its.map((i) => (
                <li key={i.id}>
                  <MediaChip type={i.mediaType} url={i.url} />
                  <div className="lib-kept-body">
                    {i.url
                      ? <a className="lib-kept-title" href={i.url} target="_blank" rel="noopener noreferrer" onClick={readerClick(i)}>{i.title}</a>
                      : <span className="lib-kept-title">{i.title}</span>}
                    <span className="lib-kept-src"> · {i.source || hostOf(i.url)} · <SlotTag slot={i.slot} />{i.signal === 'moved' && <> · <Icon name="moved" size={11} style={{ color: 'var(--accent)' }} /></>}</span>
                    <div className="lib-kept-open"><OpenButton item={i} compact /></div>
                    {(i.notes || []).map((n) => (
                      <p className="lib-kept-note" key={n.at}>{n.text} <span className="muted">· {timeAgo(n.at)}</span></p>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

// ---- 5. closed -------------------------------------------------------------------
function ClosedSection({ closed, sessions }) {
  const list = [...closed].sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));
  return (
    <section className="section" id="lib-closed">
      <div className="section-head"><h2>Closed threads</h2><span className="label">{closed.length}</span></div>
      <div className="lib-closed">
        {list.map((t) => {
          const n = sessions.filter((s) => s.threadId === t.id && s.closedAt).length;
          const first = t.articulations?.[0]?.text;
          const now = R.currentArticulation(t);
          return (
            <article className="card lib-closed-card" key={t.id}>
              <div className="label">Closed {fmtDate(t.closedAt, { year: 'numeric' })} · {plural(n, 'session')} · opened {fmtDate(t.createdAt, { year: 'numeric' })}</div>
              <a className="lib-closed-q" href={'#' + threadPath(t.id)}>{now}</a>
              {first && first !== now && <p className="lib-closed-began"><span className="label">Began as</span> {first}</p>}
              {t.synthesis
                ? <blockquote className="lib-synth">{t.synthesis}</blockquote>
                : <p className="muted lib-small">Closed without a synthesis.</p>}
              <a className="btn small ghost" href={'#' + threadPath(t.id)}>Open thread</a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
