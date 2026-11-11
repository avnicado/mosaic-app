// A quest: the conversation with the guide, the map of the territory, and
// what the guide knows about you (yours to correct). The guide points to real
// works; you open them in the reader and say how they landed.
import React, { useEffect, useRef, useState } from 'react';
import '../quest/quest.css';
import * as R from '../../data/record.js';
import { useRecord, useBusy } from '../../data/hooks.js';
import * as Q from '../../data/quests.js';
import { clearError } from '../../data/actions.js';
import { REACTIONS, LEVEL_BLURB } from '../../engine/quest.js';
import { progressText } from '../../data/progress.js';
import { go, threadPath } from '../router.js';
import { Spinner, timeAgo } from '../kit.jsx';
import { Icon, MediaChip, OpenButton, readerClick } from '../icons.jsx';

// Ways to steer, one tap each. They are sent as your words, so the guide reads them like anything else you say.
const STEERS = [
  'What should I look at next?',
  'Easier, please.',
  'I want to go deeper.',
  'Show me a different angle.',
];

export default function QuestPage({ id }) {
  const q = useRecord(() => R.getQuest(id), [id]);
  const items = useRecord(() => Object.fromEntries(R.questItems(id).map((i) => [i.id, i])), [id]);
  const busy = useBusy(id);
  const [railOpen, setRailOpen] = useState(false);
  const endRef = useRef(null);
  const count = q?.messages.length || 0;
  useEffect(() => { if (count > 1) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [count, busy.thinking]);
  if (!q) return null;

  return (
    <div className="page wide qs-page">
      <QuestHead q={q} items={items} />
      <div className="qs-layout">
        <main className="qs-main">
          <ol className="qs-convo" aria-live="polite">
            {q.messages.map((m) => <Message key={m.id} q={q} m={m} items={items} busy={busy} />)}
            {busy.thinking && <li className="qs-msg guide"><div className="qs-who">Guide</div><p className="qs-thinking"><Spinner /> thinking…</p></li>}
          </ol>
          {busy.error && (
            <div className="qs-error">
              {busy.error}
              <button className="btn link" onClick={() => { clearError(id); Q.retry(id); }}>Try again</button>
              <button className="btn link" onClick={() => clearError(id)}>Dismiss</button>
            </div>
          )}
          <Composer q={q} busy={busy} />
          <div ref={endRef} />
        </main>
        <aside className={`qs-rail ${railOpen ? 'open' : ''}`}>
          <button className="qs-rail-toggle" onClick={() => setRailOpen((v) => !v)} aria-expanded={railOpen}>
            <Icon name="quest" size={14} /> The map · what the guide knows about you <span className="qs-caret">{railOpen ? '▴' : '▾'}</span>
          </button>
          <div className="qs-rail-body">
            <QuestMap q={q} busy={busy} />
            <Learner q={q} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function QuestHead({ q, items }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(q.title);
  const all = Object.values(items);
  const status = [
    `Started ${timeAgo(q.createdAt)}`,
    all.length ? `${all.length} pointed to` : null,
    all.filter((i) => i.openedAt).length ? `${all.filter((i) => i.openedAt).length} opened` : null,
    all.filter((i) => i.reaction === 'landed').length ? `${all.filter((i) => i.reaction === 'landed').length} landed` : null,
  ].filter(Boolean);
  return (
    <header className="qs-head">
      <div className="eyebrow">Quest{q.status !== 'active' ? ' · set down' : ''}</div>
      {editing ? (
        <div className="qs-title-edit">
          <input className="field serif" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { Q.renameQuest(q.id, title); setEditing(false); } if (e.key === 'Escape') setEditing(false); }} />
          <button className="btn small primary" onClick={() => { Q.renameQuest(q.id, title); setEditing(false); }}>Save</button>
        </div>
      ) : <h1 className="qs-title" onDoubleClick={() => setEditing(true)}>{q.title}</h1>}
      <div className="qs-status">
        <span>{status.join(' · ')}</span>
        {!editing && <button className="btn link" onClick={() => { setTitle(q.title); setEditing(true); }}>Rename</button>}
        {q.status === 'active'
          ? <button className="btn link" onClick={() => Q.closeQuest(q.id)}>Set it down</button>
          : <button className="btn link" onClick={() => Q.reopenQuest(q.id)}>Pick it up again</button>}
        <button className="btn link qs-del" onClick={() => { if (window.confirm('Delete this quest, its conversation and what it pointed to? Threads you held from it stay.')) { R.deleteQuest(q.id); go('/quests'); } }}>Delete</button>
      </div>
    </header>
  );
}

function Message({ q, m, items, busy }) {
  if (m.role === 'event') return <li className="qs-event">{m.text}{m.threadId && <> <a href={'#' + threadPath(m.threadId)}>open the thread →</a></>}</li>;
  if (m.role === 'you') return <li className="qs-msg you"><div className="qs-who">You</div><p className="qs-text">{m.text}</p></li>;
  const its = (m.itemIds || []).map((x) => items[x]).filter(Boolean);
  const isLastFind = q.messages.filter((x) => x.find).pop()?.id === m.id;
  return (
    <li className="qs-msg guide">
      <div className="qs-who">Guide</div>
      {m.text.split(/\n{2,}/).map((para, k) => <p className="qs-text" key={k}>{para}</p>)}
      {m.find && (
        <div className="qs-find">
          <div className="qs-find-head">
            <span className="label">Looking for</span> {m.find.what}
            <span className={`qs-level lv-${m.find.level}`}>{m.find.level}</span>
          </div>
          {its.length > 0 && <ul className="qs-works">{its.map((it) => <Work key={it.id} it={it} />)}</ul>}
          {!its.length && isLastFind && busy.finding && <p className="qs-searching"><Spinner /> searching the web for real works…</p>}
          {!its.length && !busy.finding && (m.findEmpty || m.findFailed) && (
            <p className="qs-searching">{m.findFailed ? 'The search failed.' : 'Nothing good turned up.'} <button className="btn link" onClick={() => Q.findAgain(q.id, m.id)}>Search again</button></p>
          )}
        </div>
      )}
      {m.question && <Surfaced q={q} text={m.question} />}
    </li>
  );
}

// One work the guide pointed to.
function Work({ it }) {
  const had = progressText(it.progress);
  return (
    <li className={`qs-work ${it.reaction ? 'reacted' : ''}`}>
      <div className="qs-work-top">
        <MediaChip type={it.mediaType} url={it.url} />
        <a className="qs-work-title" href={it.url} target="_blank" rel="noopener noreferrer" onClick={readerClick(it)}>{it.title}</a>
      </div>
      <div className="qs-work-src">
        {[it.source].filter(Boolean).join(' · ')}
        {it.level && <span className={`qs-level lv-${it.level}`} title={LEVEL_BLURB[it.level]}>{it.level}</span>}
        {had && <span className="qs-had">{had}</span>}
      </div>
      {it.why && <p className="qs-work-why">{it.why}</p>}
      <div className="qs-work-acts">
        <OpenButton item={it} compact />
        <div className="qs-reacts" role="group" aria-label="How did it land?">
          {REACTIONS.map((r) => (
            <button key={r.key} className={`qs-react r-${r.key} ${it.reaction === r.key ? 'on' : ''}`} aria-pressed={it.reaction === r.key}
              onClick={() => Q.react(it.id, r.key)}>{r.label}</button>
          ))}
        </div>
      </div>
    </li>
  );
}

// A question of the learner's own that surfaced: it can become a thread.
function Surfaced({ q, text }) {
  const [edit, setEdit] = useState(null);
  const held = useRecord(() => R.allThreads().find((t) => t.questId === q.id && t.articulations?.[0]?.text === (edit ?? text)), [q.id, text, edit]);
  return (
    <div className="qs-surfaced">
      <div className="label">A question of your own</div>
      {edit == null ? <p className="qs-surfaced-q serif">“{text}”</p>
        : <textarea className="field serif" rows={2} value={edit} onChange={(e) => setEdit(e.target.value)} />}
      {held ? <a className="btn link" href={'#' + threadPath(held.id)}>Held as a thread → open it</a> : (
        <div className="qs-row">
          <button className="btn small" onClick={async () => go(threadPath(await Q.holdAsThread(q.id, edit ?? text)))}><Icon name="hold" size={14} /> Hold it as a thread</button>
          {edit == null && <button className="btn link" onClick={() => setEdit(text)}>Put it my way first</button>}
        </div>
      )}
    </div>
  );
}

function Composer({ q, busy }) {
  const [text, setText] = useState('');
  const send = (t) => { if (!t.trim() || busy.thinking) return; Q.say(q.id, t); setText(''); };
  if (q.status !== 'active') return <p className="muted qs-small">This quest is set down. Pick it up again to keep talking.</p>;
  return (
    <div className="qs-composer">
      <div className="qs-steers">
        {STEERS.map((s) => <button key={s} className="qs-steer" disabled={busy.thinking} onClick={() => send(s)}>{s}</button>)}
      </div>
      <textarea className="field qs-input" rows={2} value={text} placeholder="Tell the guide where you are, what landed, what you want next…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
      <div className="qs-row">
        <button className="btn primary small" disabled={!text.trim() || busy.thinking} onClick={() => send(text)}>Send</button>
        <span className="muted qs-small">Enter sends · Shift+Enter for a new line</span>
      </div>
    </div>
  );
}

const STATUS = [
  { key: 'open', label: 'not yet' },
  { key: 'exploring', label: 'exploring' },
  { key: 'done', label: 'done for now' },
  { key: 'set aside', label: 'set aside' },
];

function QuestMap({ q, busy }) {
  const [adding, setAdding] = useState('');
  const [holding, setHolding] = useState(null); // { id, text }
  return (
    <section className="qs-box">
      <div className="qs-box-head"><h2>The map</h2><span className="label">{q.map.length || ''}</span></div>
      {!q.map.length && <p className="muted qs-small">The guide sketches the territory as you talk. Each region can be explored here, or held as its own thread.</p>}
      <ul className="qs-map">
        {q.map.map((b) => (
          <li key={b.id} className={`qs-region st-${b.status.replace(' ', '-')}`}>
            <div className="qs-region-top">
              <span className="qs-dot" aria-hidden="true" />
              <button className="qs-region-title" disabled={busy.thinking || q.status !== 'active'} title="Ask the guide to go into this"
                onClick={() => Q.exploreBranch(q.id, b.id)}>{b.title}</button>
            </div>
            {b.why && <p className="qs-region-why">{b.why}</p>}
            <div className="qs-region-acts">
              <select className="qs-status-sel" value={b.status} onChange={(e) => Q.setBranchStatus(q.id, b.id, e.target.value)} aria-label="Status">
                {STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {b.threadId && R.getThread(b.threadId)
                ? <a className="btn link" href={'#' + threadPath(b.threadId)}>its thread →</a>
                : <button className="btn link" onClick={() => setHolding({ id: b.id, text: b.title })}>Hold as a thread</button>}
            </div>
            {holding?.id === b.id && (
              <div className="qs-hold">
                <textarea className="field serif" rows={2} autoFocus value={holding.text} onChange={(e) => setHolding({ ...holding, text: e.target.value })} />
                <p className="muted qs-small">Put it as the question you'd hold. The thread gives you four items and asks where you got to.</p>
                <div className="qs-row">
                  <button className="btn small primary" disabled={!holding.text.trim()} onClick={async () => { const tid = await Q.holdAsThread(q.id, holding.text, b.id); setHolding(null); go(threadPath(tid)); }}>Hold it</button>
                  <button className="btn link" onClick={() => setHolding(null)}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="qs-add">
        <input className="field" value={adding} placeholder="+ add a region" onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { Q.addBranch(q.id, adding); setAdding(''); } }} />
      </div>
    </section>
  );
}

const LISTS = [
  { key: 'known', label: 'Already knows' },
  { key: 'interests', label: 'Drawn to' },
  { key: 'avoid', label: 'Not interested in' },
  { key: 'prefers', label: 'Prefers' },
];

// The guide's model of you, in the open: every line is yours to correct.
function Learner({ q }) {
  const l = { ...Q.EMPTY_LEARNER, ...q.learner };
  return (
    <section className="qs-box">
      <div className="qs-box-head"><h2>What the guide knows about you</h2></div>
      <p className="muted qs-small">Only for this quest, only for you. Change anything that's wrong; the guide goes by this.</p>
      <EditLine label="Level" value={l.level} placeholder="e.g. new to it, read a couple of books" onSave={(v) => Q.setLearnerField(q.id, 'level', v)} />
      <EditLine label="Background" value={l.background} placeholder="anything relevant you bring" onSave={(v) => Q.setLearnerField(q.id, 'background', v)} />
      {LISTS.map(({ key, label }) => <ChipList key={key} label={label} list={l[key] || []} onRemove={(x) => Q.removeLearner(q.id, key, x)} onAdd={(x) => Q.addLearner(q.id, key, x)} />)}
    </section>
  );
}

function EditLine({ label, value, placeholder, onSave }) {
  const [v, setV] = useState(null);
  return (
    <div className="qs-line">
      <span className="label">{label}</span>
      {v == null
        ? <button className="qs-line-val" onClick={() => setV(value || '')}>{value || <span className="muted">{placeholder}</span>}</button>
        : <input className="field" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { onSave(v); setV(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { onSave(v); setV(null); } if (e.key === 'Escape') setV(null); }} />}
    </div>
  );
}

function ChipList({ label, list, onRemove, onAdd }) {
  const [adding, setAdding] = useState(null);
  return (
    <div className="qs-line">
      <span className="label">{label}</span>
      <div className="qs-chips">
        {list.map((x) => <span key={x} className="qs-chip">{x}<button aria-label={`Remove ${x}`} onClick={() => onRemove(x)}>×</button></span>)}
        {adding == null
          ? <button className="qs-chip add" onClick={() => setAdding('')}>+ add</button>
          : <input className="field qs-chip-in" autoFocus value={adding} onChange={(e) => setAdding(e.target.value)} onBlur={() => { onAdd(adding); setAdding(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { onAdd(adding); setAdding(null); } if (e.key === 'Escape') setAdding(null); }} />}
      </div>
    </div>
  );
}
