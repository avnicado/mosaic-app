// The thread's history, newest first: sessions (before → after, what moved),
// restatements made outside a session, pursued threads, closing.
import React from 'react';
import * as R from '../../data/record.js';
import { SlotTag } from '../kit.jsx';
import { threadPath } from '../router.js';
import { Icon, MediaChip, readerClick } from '../icons.jsx';
import { t, loc } from '../../i18n/index.js';

const fmtDate = (ts) => {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
};
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' });

export function Verdict({ diff }) {
  if (!diff) return null;
  return <span className={`th-verdict ${diff.verdict}`}>{diff.verdict === 'real' ? t('Real movement') : t('Mostly rewording')}</span>;
}

export function Moves({ moves }) {
  if (!moves?.length) return null;
  return (
    <ul className="th-moves">
      {moves.map((m, i) => <li key={i}><span className="th-move-l">{m.label}</span> {m.content}</li>)}
    </ul>
  );
}

function SignalledItems({ items }) {
  const moved = items.filter((i) => i.signal === 'moved');
  const closed = items.filter((i) => i.signal === 'closed');
  if (!moved.length && !closed.length) return null;
  const row = (i, glyph) => (
    <li key={i.id} className={`slot-${i.slot}`}>
      <span className="th-tl-glyph"><Icon name={glyph} size={12} /></span>
      <MediaChip type={i.mediaType} url={i.url} size={13} />
      <SlotTag slot={i.slot} />
      <a href={i.url} target="_blank" rel="noopener noreferrer" onClick={readerClick(i)}>{i.title}</a>
      {i.replacedBy && <span className="th-tl-swapped">{t('swapped out')}</span>}
    </li>
  );
  return <ul className="th-tl-items">{moved.map((i) => row(i, 'moved'))}{closed.map((i) => row(i, 'closed'))}</ul>;
}

function Entry({ at, kind, children }) {
  return (
    <li className={`th-tl-entry th-tl-${kind}`}>
      <div className="th-tl-when">{at ? <><span>{fmtDate(at)}</span><span className="th-tl-time">{fmtTime(at)}</span></> : null}</div>
      <div className="th-tl-body">{children}</div>
    </li>
  );
}

export default function Timeline({ thread, sessions, items, children, hideSessionId }) {
  const ev = [];
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  for (const s of sessions) {
    if (!s.closedAt || s.id === hideSessionId) continue;
    const its = items.filter((i) => i.sessionId === s.id);
    ev.push({ at: s.closedAt, key: 's' + s.id, node: (
      <Entry at={s.closedAt} kind="session">
        <div className="th-tl-kind">{t('Session')} <span className="muted">{t('· {n} items', { n: its.filter((i) => !i.replacedBy && !i.failed).length || (s.itemIds || []).filter((id) => byId[id]).length })}</span> {s.diff && <Verdict diff={s.diff} />}</div>
        {s.articulationAtClose ? (
          s.articulationAtClose.trim() === (s.articulationAtOpen || '').trim() ? (
            <p className="th-tl-q"><span className="serif">{s.articulationAtClose}</span> <span className="muted th-small">{t('(unchanged)')}</span></p>
          ) : (
            <div className="th-tl-diff">
              <p className="th-tl-before">{s.articulationAtOpen}</p>
              <p className="th-tl-after"><span className="th-arrow">{t('→')}</span> {s.articulationAtClose}</p>
            </div>
          )
        ) : <p className="muted th-small th-tl-norest">{t('Ended without restating.')}</p>}
        {s.diff?.why && <p className="th-tl-why">{s.diff.why}</p>}
        <Moves moves={s.diff?.moves} />
        <SignalledItems items={its} />
        {s.note && <p className="th-tl-note">“{s.note}”</p>}
      </Entry>
    ) });
  }
  thread.articulations.forEach((a, idx) => {
    if (idx === 0 || a.sessionId) return;
    ev.push({ at: a.at, key: 'a' + idx, node: (
      <Entry at={a.at} kind="restated">
        <div className="th-tl-kind">{t('Restated')}</div>
        <div className="th-tl-diff">
          <p className="th-tl-before">{thread.articulations[idx - 1].text}</p>
          <p className="th-tl-after"><span className="th-arrow">{t('→')}</span> {a.text}</p>
        </div>
      </Entry>
    ) });
  });
  for (const c of children) {
    ev.push({ at: c.createdAt, key: 'c' + c.id, node: (
      <Entry at={c.createdAt} kind="child">
        <div className="th-tl-kind">{t('Pursued a new thread')}{c.spawnAnchor?.title ? <span className="muted">{' '}{t('from “{title}”', { title: c.spawnAnchor.title })}</span> : null}</div>
        <p className="th-tl-q"><a className="serif" href={'#' + threadPath(c.id)}>{t('↳')} {R.currentArticulation(c)}</a>{c.status === 'closed' ? <span className="muted th-small">{' · '}{t('closed')}</span> : null}</p>
      </Entry>
    ) });
  }
  if (thread.status === 'closed' && thread.closedAt) {
    ev.push({ at: thread.closedAt, key: 'closed', node: (
      <Entry at={thread.closedAt} kind="closed">
        <div className="th-tl-kind">{t('Closed with a synthesis')}</div>
        {thread.synthesis && <p className="th-tl-synth">{thread.synthesis}</p>}
      </Entry>
    ) });
  }
  ev.sort((a, b) => b.at - a.at);
  const corr = thread.corrections || {};
  const hasCorr = corr.rejected?.length || corr.added?.length || corr.note;

  return (
    <ol className="th-tl">
      {hasCorr ? (
        <Entry kind="corr">
          <div className="th-tl-kind">{t('You corrected the reading')}</div>
          <ul className="th-tl-corr">
            {(corr.rejected || []).map((x) => <li key={'r' + x}>{t('Not true of it: {text}', { text: <s>{x}</s> })}</li>)}
            {(corr.added || []).map((a) => <li key={'a' + a.text}>{a.field === 'absent' ? t('Missing: {text}', { text: a.text }) : t('Takes for granted: {text}', { text: a.text })}</li>)}
            {corr.note && <li>{t('Note: “{text}”', { text: corr.note })}</li>}
          </ul>
        </Entry>
      ) : null}
      {ev.map((e) => <React.Fragment key={e.key}>{e.node}</React.Fragment>)}
      <Entry at={thread.createdAt} kind="start">
        <div className="th-tl-kind">{t('Started')}</div>
        <p className="th-tl-q serif">{thread.articulations[0]?.text}</p>
        {thread.parentId && (() => { const par = R.getThread(thread.parentId); return par ? <p className="muted th-small">{t('Pursued from {thread}', { thread: <a href={'#' + threadPath(par.id)}>{R.currentArticulation(par)}</a> })}{thread.spawnAnchor?.title ? <>{' · '}{t('on “{title}”', { title: thread.spawnAnchor.title })}</> : null}</p> : null; })()}
        {thread.seed && !thread.parentId && <p className="muted th-small">{t('Held from the Promenade: {title}', { title: thread.seed.url ? <a href={thread.seed.url} target="_blank" rel="noopener noreferrer">{thread.seed.title}</a> : thread.seed.title })}</p>}
        {thread.image && <p className="muted th-small">{t('Started from an image.')}</p>}
      </Entry>
    </ol>
  );
}
