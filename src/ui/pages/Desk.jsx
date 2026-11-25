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
import { t, tp, loc, useLang } from '../../i18n/index.js';

const DAY = 864e5;
const fmtDate = (ts, opts = {}) => new Date(ts).toLocaleDateString(loc(), { day: 'numeric', month: 'short', ...opts });
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? t('Good night') : h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening');
}

// "last session: real movement — scope narrowed, frame inverted"
function lastSessionLine(sessions) {
  const last = sessions.filter((s) => s.closedAt).pop();
  if (!last) return null;
  if (last.diff) {
    const moves = (last.diff.moves || []).map((m) => (m.label || '').toLowerCase()).filter(Boolean).slice(0, 2);
    if (last.diff.verdict !== 'real') return t('last session: reworded, same frame');
    return moves.length ? t('last session: real movement — {moves}', { moves: moves.join(', ') }) : t('last session: real movement');
  }
  if (!last.articulationAtClose) return t('last session ended without a restatement');
  return null;
}

function useDesk() {
  const lang = useLang(); // the rows hold translated lines, so rebuild them when the language changes
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
  }, [lang]);
}

export default function Desk() {
  const d = useDesk();
  const now = new Date();
  return (
    <div className="page desk">
      <header className="desk-head">
        <span className="desk-greet">{greeting(now)}.</span>{' '}
        <span className="desk-date">{now.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </header>

      {!d.any ? <FirstRun /> : (
        <>
          {d.pledge && <PledgeStrip pledge={d.pledge} />}

          {d.comeBack && <ComeBack offer={d.comeBack} />}

          {d.open.length > 0 && (
            <section className="section desk-section">
              <div className="section-head"><span className="label">{t('In progress')}</span></div>
              <ul className="desk-list">
                {d.open.map(({ s, t: th, marked, total, kept }) => (
                  <li key={s.id}>
                    <a className="desk-row desk-open" href={'#' + threadPath(th.id)}>
                      <span className="desk-dot" aria-hidden />
                      <span className="desk-row-main">
                        <span className="desk-q">{R.currentArticulation(th)}</span>
                        <span className="desk-meta">
                          {kept
                            ? t('session started {when} · {marked} of {total} marked · {kept} kept', { when: timeAgo(s.openedAt), marked, total, kept })
                            : t('session started {when} · {marked} of {total} marked', { when: timeAgo(s.openedAt), marked, total })}
                        </span>
                      </span>
                      <span className="desk-go">{t('Continue →')}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="section desk-section">
            <div className="section-head">
              <span className="label">{d.open.length ? t('Your other threads') : t('Your threads')}</span>
              <a className="btn link" href="#/new">{t('+ New thread')}</a>
            </div>
            {d.threads.length ? (
              <ul className="desk-list">{d.threads.map((r) => <ThreadRow key={r.t.id} r={r} />)}</ul>
            ) : (
              <p className="desk-none muted">
                {d.activeCount ? t('Nothing else open right now.') : d.closedCount ? t('No threads open. Closed ones are in the Library.') : t('No threads open.')}
              </p>
            )}
            {d.quiet.length > 0 && (
              <div className="desk-quiet">
                <div className="label desk-quiet-label">{t('Quiet')}</div>
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
  const { t: th } = r;
  const touched = th.touchedAt || th.createdAt;
  const bits = [
    quiet ? t('quiet since {date}', { date: fmtDate(touched, { year: new Date(touched).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) }) : t('touched {when}', { when: timeAgo(touched) }),
    r.sessions ? tp(r.sessions, '{n} session', '{n} sessions') : t('no sessions yet'),
    r.kept ? t('{n} kept', { n: r.kept }) : null,
    r.branches ? tp(r.branches, '{n} branch', '{n} branches') : null,
  ].filter(Boolean);
  return (
    <li>
      <a className={`desk-row ${quiet ? 'quiet' : ''}`} href={'#' + threadPath(th.id)}>
        <span className="desk-row-main">
          <span className="desk-q">{R.currentArticulation(th)}</span>
          <span className="desk-meta">{bits.join(' · ')}</span>
          {r.last && <span className="desk-meta desk-last">{r.last}</span>}
          {r.parent && <span className="desk-meta desk-from">{t('branched from “{question}”', { question: clip(r.parent, 70) })}</span>}
        </span>
      </a>
    </li>
  );
}

// Offered once per quiet spell. Quiet is not wrong; this only asks.
function ComeBack({ offer }) {
  const { thread: th, real, quietSince } = offer;
  const year = new Date(quietSince).getFullYear() === new Date().getFullYear() ? undefined : 'numeric';
  return (
    <aside className="desk-return" aria-label={t('A quiet thread')}>
      <div className="label">{t('A quiet thread')}</div>
      <p className="desk-return-q">“{R.currentArticulation(th)}”</p>
      <p className="desk-return-why muted">
        {real
          ? tp(real, 'Quiet since {date}. That is not wrong. It really moved once before. Pick it up if it still pulls at you.', 'Quiet since {date}. That is not wrong. It really moved {n} times before. Pick it up if it still pulls at you.', { date: fmtDate(quietSince, { year }) })
          : t('Quiet since {date}. That is not wrong. Pick it up if it still pulls at you.', { date: fmtDate(quietSince, { year }) })}
      </p>
      <div className="desk-return-actions">
        <button className="btn small primary" onClick={() => { answerReturnOffer(th.id, 'opened'); go(threadPath(th.id)); }}>{t('Open it')}</button>
        <button className="btn small ghost" onClick={() => answerReturnOffer(th.id, 'later')}>{t('Not now')}</button>
      </div>
    </aside>
  );
}

// A pledge stores rating keys; the strip shows the key itself, in the interface language.
const AXIS_WORDS = {
  get informative() { return t('informative'); },
  get artistic() { return t('artistic'); },
  get profound() { return t('profound'); },
  get ethical() { return t('ethical'); },
  get entertaining() { return t('entertaining'); },
  get provoking() { return t('provoking'); },
};
const axisWord = (k) => (Object.hasOwn(AXIS_WORDS, k) ? AXIS_WORDS[k] : k);

function PledgeStrip({ pledge }) {
  const bar = Object.entries(pledge.bar || {}).filter(([, v]) => typeof v === 'number');
  if (!bar.length) return null;
  const left = pledge.endsAt ? Math.ceil((pledge.endsAt - Date.now()) / DAY) : null;
  const ended = left != null && left <= 0;
  const axes = bar.map(([k, v]) => `${axisWord(k)} ≥ ${v}`).join(' · ');
  return (
    <div className="desk-pledge">
      <span className="label">{t('Pledge')}</span>
      <span className="desk-pledge-text">
        {ended ? t('Your bar ended {date}: {axes}', { date: fmtDate(pledge.endsAt), axes })
          : pledge.endsAt ? t('Your bar until {date}: {axes}', { date: fmtDate(pledge.endsAt), axes })
          : t('Your bar: {axes}', { axes })}
        {!ended && left != null && <span className="muted"> · {tp(left, '{n} day left', '{n} days left')}</span>}
      </span>
      <a className="btn link" href="#/settings">{t('Settings')}</a>
    </div>
  );
}

function FirstRun() {
  return (
    <section className="desk-first">
      <p className="desk-first-lede">
        {t('Mosaic keeps the questions you’re turning over. For each one it brings four things that each do a different job, and you restate the question as your thinking moves.')}
      </p>
      <div className="desk-first-actions">
        <a className="btn primary" href="#/new">{t('Start a thread')}</a>
        <a className="btn ghost" href="#/promenade">{t('Browse the Promenade')}</a>
      </div>
      <p className="muted desk-first-small">{t('A thread can start from a question, a hunch, an image, or “show me…”. Nothing needs to be finished.')}</p>
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
        <span className="label">{t('From today’s shelf')}</span>
        <a className="btn link" href="#/promenade">{t('Open the Promenade →')}</a>
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
