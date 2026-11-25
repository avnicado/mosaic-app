import React, { useMemo, useState } from 'react';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { go, threadPath } from '../router.js';
import { SlotTag, hostOf, timeAgo } from '../kit.jsx';
import ReadingMosaic from '../mosaic/ReadingMosaic.jsx';
import CoralReef from '../coral/CoralReef.jsx';
import { MediaChip, OpenButton, Icon, readerClick } from '../icons.jsx';
import {
  snapshot, weekGrid, slotSignals, recurring, corrections, verdicts,
  SLOT_ORDER, joinWords, cap, fmtDate,
} from '../library/derive.js';
import './library.css';
import { t, tp, loc } from '../../i18n/index.js';

// Reef is switched off for now (2026-10-05). Set to true to show it again.
const REEF_ENABLED = false;

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
        <div className="eyebrow">{t('Library')}</div>
        <h1>{t('Library')}</h1>
        <p className="lib-empty">{t('Nothing to mirror yet. {link}.', { link: <a href="#/new">{t('Start a thread')}</a> })}</p>
      </div>
    );
  }

  const active = threads.filter((t) => t.status === 'active' && !R.isDormant(t)).length;
  const quiet = threads.filter((t) => R.isDormant(t)).length;
  const closed = threads.filter((t) => t.status === 'closed');
  const since = Math.min(...threads.map((t) => t.createdAt || Date.now()));

  return (
    <div className="page wide lib">
      <div className="eyebrow">{t('Library')}</div>
      <h1>{t('Your record')}</h1>
      <p className="lib-sub">
        {t('{threads} since {date}: {counts}.', {
          threads: tp(threads.length, '{n} thread', '{n} threads'),
          date: fmtDate(since, { year: 'numeric' }),
          counts: [active && t('{n} active', { n: active }), quiet && t('{n} quiet', { n: quiet }), closed.length && t('{n} closed', { n: closed.length })].filter(Boolean).join(', '),
        })}
        {' '}{t("A mirror of what you've done, for you only.")}
      </p>
      <nav className="lib-toc" aria-label={t('On this page')}>
        {REEF_ENABLED && <a href="#/library" onClick={(e) => jump(e, 'lib-reef')}>{t('Reef')}</a>}
        <a href="#/library" onClick={(e) => jump(e, 'lib-mosaic')}>{t('Mosaic')}</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-threads')}>{t('Threads')}</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-weeks')}>{t('Weeks')}</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-move')}>{t('How you move')}</a>
        <a href="#/library" onClick={(e) => jump(e, 'lib-kept')}>{t('Kept#heading')}</a>
        {closed.length > 0 && <a href="#/library" onClick={(e) => jump(e, 'lib-closed')}>{t('Closed')}</a>}
      </nav>

      {REEF_ENABLED && <ReefSection threads={threads} sessions={sessions} items={items} />}
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

// ---- 0. reef ---------------------------------------------------------------------
function ReefSection({ threads, sessions, items }) {
  return (
    <section className="section" id="lib-reef">
      <div className="section-head"><h2>{t('Reef')}</h2><span className="label">{t('where your questions moved')}</span></div>
      <CoralReef threads={threads} sessions={sessions} items={items} />
    </section>
  );
}

// ---- 1. mosaic -------------------------------------------------------------------
function MosaicSection({ threads, items }) {
  return (
    <section className="section" id="lib-mosaic">
      <div className="section-head"><h2>{t('Mosaic')}</h2><span className="label">{t("what you've read and seen")}</span></div>
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
    return { th: t, n: done.length, real, cos, un: done.length - real - cos };
  });
  return (
    <section className="section" id="lib-threads">
      <div className="section-head"><h2>{t('Threads')}</h2><span className="label">{t('did the question move?')}</span></div>
      <ul className="lib-panels">
        {rows.map(({ th, n, real, cos, un }) => (
          <li key={th.id}>
            <span className={`lib-panel-dot ${real ? 'real' : ''}`} title={real ? t('really moved at least once') : t('not yet really moved')} />
            <span>
              <ThreadLink t={th} className={th.status === 'closed' ? 'closed' : ''} />
              <span className="lib-panel-meta">
                {n ? [real && t('{n} real', { n: real }), cos && t('{n} cosmetic', { n: cos }), un && t('{n} not judged', { n: un })].filter(Boolean).join(' · ') : t('no finished session')}
                {th.status === 'closed' && ' · ' + t('closed')}{R.isDormant(th) && ' · ' + t('quiet')}
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
  if (c.sessions) parts.push(tp(c.sessions, '{n} session opened', '{n} sessions opened'));
  if (c.marked) parts.push(tp(c.marked, '{n} item marked', '{n} items marked') + (c.moved ? ` (${c.moved} ✦)` : ''));
  if (c.restated) parts.push(tp(c.restated, '{n} restatement', '{n} restatements'));
  if (c.real) parts.push(c.real === 1 ? t('real movement') : t('{n} real movements', { n: c.real }));
  if (c.cosmetic) parts.push(c.cosmetic === 1 ? t('a cosmetic restatement') : t('{n} cosmetic', { n: c.cosmetic }));
  if (c.kept) parts.push(t('{n} kept', { n: c.kept }));
  if (c.created) parts.push(t('thread started'));
  if (c.closedThread) parts.push(t('thread closed'));
  return parts.length ? parts.join(' · ') : t('nothing');
}

function WeeksSection({ rec }) {
  const { weeks, rows } = useMemo(() => weekGrid(rec, 16), [rec]);
  const [tip, setTip] = useState(null);
  const shown = rows.filter((r) => r.any);
  const hidden = rows.length - shown.length;
  const months = weeks.map((w, i) => {
    const m = new Date(w).getMonth();
    return i === 0 || m !== new Date(weeks[i - 1]).getMonth() ? new Date(w).toLocaleDateString(loc(), { month: 'short' }) : '';
  });
  const onEnter = (e, r, c) => {
    const box = e.currentTarget.closest('.lib-weeks').getBoundingClientRect();
    const cb = e.currentTarget.getBoundingClientRect();
    setTip({
      x: Math.min(Math.max(cb.left - box.left + cb.width / 2, 110), box.width - 110),
      y: cb.top - box.top,
      title: R.currentArticulation(r.thread),
      week: t('Week of {date}', { date: fmtDate(c.start) }),
      body: cellWords(c),
    });
  };
  return (
    <section className="section" id="lib-weeks">
      <div className="section-head"><h2>{t('Weeks')}</h2><span className="label">{t('last 16 weeks')}</span></div>
      {!shown.length ? (
        <p className="muted">{t('No activity in the last 16 weeks.')}</p>
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
                  aria-label={t('Week of {date}: {activity}', { date: fmtDate(c.start), activity: cellWords(c) })} />
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
            <span><i className="lib-wk-cell t3" /> {t('6+ sessions, marks and restatements')}</span>
            {shown.some((r) => r.cells.some((c) => c.real)) && <span><i className="lib-wk-cell t1 real" /> {t('a session that really moved the question')}</span>}
            {shown.some((r) => r.cells.some((c) => c.closedThread)) && <span><i className="lib-wk-cell t1 shut" /> {t('the week a thread was closed')}</span>}
          </div>
          {hidden > 0 && <p className="lib-note">{tp(hidden, '{n} thread with nothing in these weeks is left out.', '{n} threads with nothing in these weeks are left out.')}</p>}
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
      <div className="section-head"><h2>{t('How you move')}</h2><span className="label">{t('across every thread')}</span></div>
      <div className="lib-move">
        <div>
          <h3 className="lib-h">{t('What moved you, by slot')}</h3>
          <p className="lib-lead">
            {top.length
              ? (top.length > 1
                ? t('{slots} items have moved you most, equally.', { slots: cap(joinWords(top.map((x) => t(x)))) })
                : t('{slots} items have moved you most.', { slots: cap(joinWords(top.map((x) => t(x)))) }))
              : t('You haven’t marked anything ✦ moved me yet.')}
            {shut.length > 0 && <>{' '}{shut.length > 1
              ? t('{slots} are where you’ve most often marked – closed it down.', { slots: cap(joinWords(shut.map((x) => t(x)))) })
              : t('{slots} is where you’ve most often marked – closed it down.', { slots: cap(joinWords(shut.map((x) => t(x)))) })}</>}
          </p>
          <div className="lib-slots" role="table" aria-label={t('Marks per slot')}>
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
                  <span role="cell" className="lib-slot-nums">✦ {o.moved} · ○ {o.neutral} · – {o.closed} <span className="muted">{t('of {n}', { n: o.shown })}</span></span>
                </div>
              );
            })}
          </div>
          <p className="lib-note">{t('✦ moved me · ○ neutral · – closed it down, out of every item placed in that slot.')}</p>
        </div>

        <div>
          <h3 className="lib-h">{t('Restatements')}</h3>
          {v.finished ? (
            <>
              <p className="lib-lead">
                {(() => {
                  const vars = { finished: tp(v.finished, '{n} finished session', '{n} finished sessions'), real: v.real, cosmetic: v.cosmetic, unjudged: v.unjudged };
                  if (v.unjudged) {
                    return v.cosmetic === 1
                      ? t('Of {finished}, {real} really moved the question, {cosmetic} was rewording, and {unjudged} ended without a restatement.', vars)
                      : t('Of {finished}, {real} really moved the question, {cosmetic} were rewording, and {unjudged} ended without a restatement.', vars);
                  }
                  return v.cosmetic === 1
                    ? t('Of {finished}, {real} really moved the question, {cosmetic} was rewording.', vars)
                    : t('Of {finished}, {real} really moved the question, {cosmetic} were rewording.', vars);
                })()}
                {v.open ? ' ' + tp(v.open, '{n} session is still open.', '{n} sessions are still open.') : ''}
              </p>
              {v.moves.length > 0 && (
                <>
                  <div className="label lib-mini">{t('Kinds of movement named')}</div>
                  <ul className="lib-plain">
                    {v.moves.slice(0, 6).map(([label, n]) => <li key={label}>{label}{n > 1 && <span className="muted"> ×{n}</span>}</li>)}
                  </ul>
                </>
              )}
            </>
          ) : <p className="muted">{t('No session has finished yet.')}</p>}
        </div>

        <div>
          <h3 className="lib-h">{t('What the readings keep finding')}</h3>
          <Recurring title={t('Taken for granted in more than one thread')} groups={pres}
            none={t('No presupposition has come up in more than one thread yet.')} />
          <Recurring title={t('Said to be missing in more than one thread')} groups={abs}
            none={t('No absence has come up in more than one thread yet.')} />
        </div>

        <div>
          <h3 className="lib-h">{t('Your corrections')}</h3>
          {corr.rejected + corr.addedPre + corr.addedAbsent + corr.notes === 0 ? (
            <p className="muted">{t('You haven’t corrected a reading yet.')}</p>
          ) : (
            <>
              <p className="lib-lead">
                {[
                  corr.rejected && tp(corr.rejected, 'You’ve rejected {n} thing a reading claimed', 'You’ve rejected {n} things a reading claimed'),
                  corr.addedPre && tp(corr.addedPre, 'added {n} presupposition it missed', 'added {n} presuppositions it missed'),
                  corr.addedAbsent && tp(corr.addedAbsent, 'named {n} thing it left out', 'named {n} things it left out'),
                  corr.notes && tp(corr.notes, 'left a note on {n} reading', 'left a note on {n} readings'),
                ].filter(Boolean).join(', ').replace(/^./, (c) => c.toUpperCase())}.
              </p>
              <ul className="lib-corr">
                {corr.recent.map((c, i) => (
                  <li key={i}>
                    <span className={`lib-corr-kind k-${c.kind}`}>{{ rejected: t('rejected#correction'), 'added-pre': t('added#correction'), 'added-absent': t('missing#correction'), note: t('note') }[c.kind]}</span>
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
              <span className="muted">· {t('{n} threads', { n: g.threads.length })}{g.rejectedElsewhere ? ' · ' + t('you’ve rejected this before') : ''}</span>
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
        <h2>{t('Kept#heading')}</h2>
        {kept.length > 0 && (
          <div className="lib-filter" role="group" aria-label={t('Filter kept items')}>
            <button className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('All · {n}', { n: kept.length })}</button>
            <button className={filter === 'notes' ? 'on' : ''} aria-pressed={filter === 'notes'} onClick={() => setFilter('notes')}>{t('With notes · {n}', { n: withNotes.length })}</button>
          </div>
        )}
      </div>
      {!kept.length ? <p className="muted">{t('Nothing kept yet. Keep an item from a feed and it shows up here.')}</p>
        : !groups.length ? <p className="muted">{t('No kept item has a note yet.')}</p>
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
      <div className="section-head"><h2>{t('Closed threads')}</h2><span className="label">{closed.length}</span></div>
      <div className="lib-closed">
        {list.map((th) => {
          const n = sessions.filter((s) => s.threadId === th.id && s.closedAt).length;
          const first = th.articulations?.[0]?.text;
          const now = R.currentArticulation(th);
          return (
            <article className="card lib-closed-card" key={th.id}>
              <div className="label">{t('Closed {date} · {sessions} · opened {opened}', { date: fmtDate(th.closedAt, { year: 'numeric' }), sessions: tp(n, '{n} session', '{n} sessions'), opened: fmtDate(th.createdAt, { year: 'numeric' }) })}</div>
              <a className="lib-closed-q" href={'#' + threadPath(th.id)}>{now}</a>
              {first && first !== now && <p className="lib-closed-began"><span className="label">{t('Began as')}</span> {first}</p>}
              {th.synthesis
                ? <blockquote className="lib-synth">{th.synthesis}</blockquote>
                : <p className="muted lib-small">{t('Closed without a synthesis.')}</p>}
              <a className="btn small ghost" href={'#' + threadPath(th.id)}>{t('Open thread')}</a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
