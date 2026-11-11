// Quests: subjects you want to learn your way into. A guide talks with you,
// keeps a map of the territory, and points you to real works at your level.
// It guides; it doesn't teach.
import React, { useState } from 'react';
import '../quest/quest.css';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { startQuest } from '../../data/quests.js';
import { go, questPath } from '../router.js';
import { timeAgo } from '../kit.jsx';
import { Icon } from '../icons.jsx';

const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export default function Quests() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const quests = useRecord(() => R.listQuests().map((q) => {
    const items = R.questItems(q.id);
    const lastGuide = [...q.messages].reverse().find((m) => m.role === 'guide');
    return {
      q,
      regions: q.map.length,
      pointed: items.length,
      landed: items.filter((i) => i.reaction === 'landed').length,
      last: lastGuide?.text || '',
    };
  }));
  const active = quests.filter((x) => x.q.status === 'active');
  const closed = quests.filter((x) => x.q.status !== 'active');

  const start = () => {
    try { go(questPath(startQuest(text))); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="page qs-list-page">
      <div className="eyebrow">Quests</div>
      <h1>What do you want to learn?</h1>
      <p className="qs-lede">
        A quest is a subject you want to learn your way into. A guide talks it through with you, keeps a map of the
        territory, and points you to real works by real people, at your level. It doesn't teach you; it shows you where to go,
        and listens to how it went.
      </p>
      <div className="qs-start">
        <textarea className="field serif qs-start-field" rows={2} value={text} placeholder="e.g. Teach me about rationality — I’ve read a bit of Kahneman"
          onChange={(e) => { setText(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }} />
        <div className="qs-start-row">
          <button className="btn primary" disabled={!text.trim()} onClick={start}><Icon name="quest" size={15} /> Start the quest</button>
          <span className="muted qs-small">Say it however it comes. A broad subject is fine: the guide will ask.</span>
        </div>
        {err && <p className="qs-err">{err}</p>}
      </div>

      {active.length > 0 && (
        <section className="section qs-section">
          <div className="section-head"><h2>Your quests</h2></div>
          <ul className="desk-list">
            {active.map(({ q, regions, pointed, landed, last }) => (
              <li key={q.id}>
                <a className="desk-row" href={'#' + questPath(q.id)}>
                  <span className="desk-row-main">
                    <span className="desk-q">{q.title}</span>
                    <span className="desk-meta">
                      {[`touched ${timeAgo(q.touchedAt)}`, regions && plural(regions, 'region'), pointed && `${plural(pointed, 'thing')} pointed to`, landed && `${landed} landed`].filter(Boolean).join(' · ')}
                    </span>
                    {last && <span className="desk-meta desk-last qs-last">Guide: {clip(last, 140)}</span>}
                  </span>
                  <span className="desk-go">continue →</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {closed.length > 0 && (
        <section className="section qs-section">
          <div className="section-head"><h2>Set down</h2></div>
          <ul className="desk-list">
            {closed.map(({ q }) => (
              <li key={q.id}><a className="desk-row quiet" href={'#' + questPath(q.id)}><span className="desk-row-main"><span className="desk-q">{q.title}</span></span></a></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
