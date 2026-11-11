// The Desk: where you land each day. What's in progress, the threads you hold,
// a few cards from today's shelf. No stats to chase.
import React, { useEffect } from 'react';
import './desk.css';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { threadPath, go } from '../router.js';
import { timeAgo } from '../kit.jsx';
import { returnOffer, answerReturnOffer } from '../../data/dormant.js';
import { useShelf, ensureShelf, deskPicks, sectionTitle } from '../promenade/shelf.js';
import ShelfCard, { ShelfSkeleton } from '../promenade/ShelfCard.jsx';

const DAY = 864e5;
const fmtDate = (ts, opts = {}) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...opts });
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// "last session: real movement — scope narrowed, frame inverted"
function lastSessionLine(sessions) {
  const last = sessions.filter((s) => s.closedAt).pop();
  if (!last) return null;
  if (last.diff) {
    const moves = (last.diff.moves || []).map((m) => (m.label || '').toLowerCase()).filter(Boolean).slice(0, 2);
    const verdict = last.diff.verdict === 'real' ? 'real movement' : 'reworded, same frame';
    return `last session: ${verdict}${moves.length && last.diff.verdict === 'real' ? ' — ' + moves.join(', ') : ''}`;
  }
  if (!last.articulationAtClose) return 'last session ended without a restatement';
  return null;
}

function useDesk() {
  return useRecord(() => {
    const threads = R.listThreads();
    const byId = Object.fromEntries(threads.map((t) => [t.id, t]));
    const open = R.openSessions()
      .map((s) => {
        const t = byId[s.threadId];
        if (!t) return null;
        const items = R.sessionItems(s).filter((i) => !i.failed);
        return {
          s, t,
          marked: items.filter((i) => i.signal).length,
          total: Math.max(4, items.length),
          kept: items.filter((i) => i.kept).length,
        };
      })
      .filter(Boolean);
    const openIds = new Set(open.map((o) => o.t.id));
    const row = (t) => {
      const sessions = R.sessionsFor(t.id);
      const parent = t.parentId ? byId[t.parentId] : null;
      return {
        t, sessions: sessions.length,
        kept: R.keptItems(t.id).length,
        branches: R.childrenOf(t.id).length,
        last: lastSessionLine(sessions),
        parent: parent ? R.currentArticulation(parent) : null,
      };
    };
    const active = threads.filter((t) => t.status === 'active' && !R.isDormant(t));
    return {
      any: threads.length > 0,
      closedCount: threads.filter((t) => t.status === 'closed').length,
      open,
      activeCount: active.length,
      threads: active.filter((t) => !openIds.has(t.id)).map(row),
      quiet: threads.filter((t) => R.isDormant(t)).map(row),
      pledge: R.getPledge(),
      comeBack: returnOffer(threads, R.allSessions()),
    };
  });
}

export default function Desk() {
  const d = useDesk();
  const now = new Date();
  return (
    <div className="page desk">
      <header className="desk-head">
        <span className="desk-greet">{greeting(now)}.</span>{' '}
        <span className="desk-date">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </header>

      {!d.any ? <FirstRun /> : (
        <>
          {d.pledge && <PledgeStrip pledge={d.pledge} />}

          {d.comeBack && <ComeBack offer={d.comeBack} />}

          {d.open.length > 0 && (
            <section className="section desk-section">
              <div className="section-head"><span className="label">In progress</span></div>
              <ul className="desk-list">
                {d.open.map(({ s, t, marked, total, kept }) => (
                  <li key={s.id}>
                    <a className="desk-row desk-open" href={'#' + threadPath(t.id)}>
                      <span className="desk-dot" aria-hidden />
                      <span className="desk-row-main">
                        <span className="desk-q">{R.currentArticulation(t)}</span>
                        <span className="desk-meta">
                          session started {timeAgo(s.openedAt)} · {marked} of {total} marked{kept ? ` · ${kept} kept` : ''}
                        </span>
                      </span>
                      <span className="desk-go">Continue →</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section desk-section">
            <div className="section-head">
              <span className="label">{d.open.length ? 'Your other threads' : 'Your threads'}</span>
              <a className="btn link" href="#/new">+ New thread</a>
            </div>
            {d.threads.length ? (
              <ul className="desk-list">{d.threads.map((r) => <ThreadRow key={r.t.id} r={r} />)}</ul>
            ) : (
              <p className="desk-none muted">
                {d.activeCount ? 'Nothing else open right now.' : d.closedCount ? 'No threads open. Closed ones are in the Library.' : 'No threads open.'}
              </p>
            )}
            {d.quiet.length > 0 && (
              <div className="desk-quiet">
                <div className="label desk-quiet-label">Quiet</div>
                <ul className="desk-list">{d.quiet.map((r) => <ThreadRow key={r.t.id} r={r} quiet />)}</ul>
              </div>
            )}
          </section>
        </>
      )}

      <DeskShelf />
    </div>
  );
}

function ThreadRow({ r, quiet = false }) {
  const { t } = r;
  const touched = t.touchedAt || t.createdAt;
  const bits = [
    quiet ? `quiet since ${fmtDate(touched, { year: new Date(touched).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })}` : `touched ${timeAgo(touched)}`,
    r.sessions ? plural(r.sessions, 'session') : 'no sessions yet',
    r.kept ? `${r.kept} kept` : null,
    r.branches ? plural(r.branches, 'branch', 'branches') : null,
  ].filter(Boolean);
  return (
    <li>
      <a className={`desk-row ${quiet ? 'quiet' : ''}`} href={'#' + threadPath(t.id)}>
        <span className="desk-row-main">
          <span className="desk-q">{R.currentArticulation(t)}</span>
          <span className="desk-meta">{bits.join(' · ')}</span>
          {r.last && <span className="desk-meta desk-last">{r.last}</span>}
          {r.parent && <span className="desk-meta desk-from">branched from “{clip(r.parent, 70)}”</span>}
        </span>
      </a>
    </li>
  );
}

// Offered once per quiet spell. Quiet is not wrong; this only asks.
function ComeBack({ offer }) {
  const { thread: t, real, quietSince } = offer;
  const year = new Date(quietSince).getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
  return (
    <aside className="desk-return" aria-label="A quiet thread">
      <div className="label">A quiet thread</div>
      <p className="desk-return-q">“{R.currentArticulation(t)}”</p>
      <p className="desk-return-why muted">
        Quiet since {fmtDate(quietSince, { year })}. That is not wrong.
        {real ? ` It really moved ${real === 1 ? 'once' : `${real} times`} before.` : ''} Pick it up if it still pulls at you.
      </p>
      <div className="desk-return-actions">
        <button className="btn small primary" onClick={() => { answerReturnOffer(t.id, 'opened'); go(threadPath(t.id)); }}>Open it</button>
        <button className="btn small ghost" onClick={() => answerReturnOffer(t.id, 'later')}>Not now</button>
      </div>
    </aside>
  );
}

function PledgeStrip({ pledge }) {
  const bar = Object.entries(pledge.bar || {}).filter(([, v]) => typeof v === 'number');
  if (!bar.length) return null;
  const left = pledge.endsAt ? Math.ceil((pledge.endsAt - Date.now()) / DAY) : null;
  const ended = left != null && left <= 0;
  return (
    <div className="desk-pledge">
      <span className="label">Pledge</span>
      <span className="desk-pledge-text">
        {ended ? `Your bar ended ${fmtDate(pledge.endsAt)}` : pledge.endsAt ? `Your bar until ${fmtDate(pledge.endsAt)}` : 'Your bar'}:{' '}
        {bar.map(([k, v]) => `${k} ≥ ${v}`).join(' · ')}
        {!ended && left != null && <span className="muted"> · {plural(left, 'day')} left</span>}
      </span>
      <a className="btn link" href="#/settings">Settings</a>
    </div>
  );
}

function FirstRun() {
  return (
    <section className="desk-first">
      <p className="desk-first-lede">
        Mosaic keeps the questions you’re turning over. For each one it brings four things that each do a different job,
        and you restate the question as your thinking moves.
      </p>
      <div className="desk-first-actions">
        <a className="btn primary" href="#/new">Start a thread</a>
        <a className="btn ghost" href="#/promenade">Browse the Promenade</a>
      </div>
      <p className="muted desk-first-small">A thread can start from a question, a hunch, an image, or “show me…”. Nothing needs to be finished.</p>
    </section>
  );
}

function DeskShelf() {
  const { status, shelf } = useShelf();
  useEffect(() => { ensureShelf(); }, []);
  if (status === 'error') return null; // The Promenade page explains; the Desk stays calm.
  const picks = status === 'ready' ? deskPicks(shelf) : [];
  if (status === 'ready' && !picks.length) return null;
  return (
    <section className="section desk-section desk-shelf">
      <div className="section-head">
        <span className="label">From today’s shelf</span>
        <a className="btn link" href="#/promenade">Open the Promenade →</a>
      </div>
      {status !== 'ready' ? <ShelfSkeleton sections={1} compact /> : (
        <div className="pm-grid compact">
          {picks.map(({ card, section }) => (
            <div key={card.url || card.id} className="pm-cell desk-pick">
              <div className="desk-pick-from">{sectionTitle(section, shelf.hasThreads)}</div>
              <ShelfCard card={card} compact />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
