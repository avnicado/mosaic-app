import React, { useEffect, useState, useSyncExternalStore } from 'react';
import './app.css';
import { useRoute, go, threadPath, sharedPath, questPath } from './router.js';
import { useRecord } from '../data/hooks.js';
import * as R from '../data/record.js';
import Desk from './pages/Desk.jsx';
import ThreadPage from './pages/ThreadPage.jsx';
import NewThread from './pages/NewThread.jsx';
import Promenade from './pages/Promenade.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Quests from './pages/Quests.jsx';
import QuestPage from './pages/QuestPage.jsx';
import SharedThread from './pages/SharedThread.jsx';
import { startSharing, subscribeShared, getSharedVersion, getOthers } from '../data/sharing.js';
import { getSessionInfo } from '../session.js';
import { Icon } from './icons.jsx';
import Reader from './reader/Reader.jsx';
import { FeedbackButton, useUnreadFeedback } from './feedback/Feedback.jsx';

function Sidebar({ route, onNavigate }) {
  const [showClosed, setShowClosed] = useState(false);
  const { active, quiet, closed, open, quests } = useRecord(() => {
    const ts = R.listThreads();
    const openIds = new Set(R.openSessions().map((s) => s.threadId));
    return {
      active: ts.filter((t) => t.status === 'active' && !R.isDormant(t)),
      quiet: ts.filter((t) => R.isDormant(t)),
      closed: ts.filter((t) => t.status === 'closed'),
      open: openIds,
      quests: R.listQuests().filter((q) => q.status === 'active'),
    };
  });
  const unreadFeedback = useUnreadFeedback();
  const link = (name, path, label, icon, badge = 0) => (
    <a href={'#' + path} className={`side-link ${route.name === name ? 'active' : ''}`} onClick={onNavigate}>
      <Icon name={icon} size={17} />{label}
      {badge > 0 && <span className="side-badge" title={`${badge} unread feedback`}>{badge}</span>}
    </a>
  );
  const threadLink = (t, cls = '') => (
    <a key={t.id} href={'#' + threadPath(t.id)} onClick={onNavigate}
      className={`side-thread ${cls} ${route.name === 'thread' && route.id === t.id ? 'active' : ''}`}
      title={R.currentArticulation(t)}>
      <span className="clamp">{open.has(t.id) && <span className="open-dot" title="session in progress" />}{R.currentArticulation(t)}</span>
    </a>
  );
  return (
    <nav className="sidebar" aria-label="Main">
      <a className="brand" href="#/" onClick={onNavigate}><Icon name="mosaic" size={20} className="brand-ic" />Mosaic<span className="brand-alpha">alpha</span></a>
      <a className="btn primary side-new" href="#/new" onClick={onNavigate}><Icon name="plus" size={15} /> New thread</a>
      {link('desk', '/', 'Desk', 'desk')}
      {link('quests', '/quests', 'Quests', 'quest')}
      {quests.length > 0 && <div className="side-section">Quests</div>}
      {quests.map((q) => (
        <a key={q.id} href={'#' + questPath(q.id)} onClick={onNavigate} title={q.title}
          className={`side-thread side-quest ${route.name === 'quest' && route.id === q.id ? 'active' : ''}`}>
          <span className="clamp">{q.title}</span>
        </a>
      ))}
      <div className="side-section">Threads</div>
      {active.length ? active.map((t) => threadLink(t)) : <div className="side-link muted" style={{ fontStyle: 'italic' }}>None yet</div>}
      {quiet.length > 0 && <div className="side-section">Quiet</div>}
      {quiet.map((t) => threadLink(t, 'quiet'))}
      {closed.length > 0 && (
        <div className="side-section">
          Closed · {closed.length}
          <button onClick={() => setShowClosed((v) => !v)}>{showClosed ? 'hide' : 'show'}</button>
        </div>
      )}
      {showClosed && closed.map((t) => threadLink(t, 'closed'))}
      <SharedSection route={route} onNavigate={onNavigate} />
      <div className="side-spacer" />
      <div className="side-foot">
        {link('promenade', '/promenade', 'Promenade', 'promenade')}
        {link('library', '/library', 'Library', 'library')}
        <FeedbackButton page={route.name} />
        {link('settings', '/settings', 'Settings', 'settings', unreadFeedback)}
        <SignedInAs />
      </div>
    </nav>
  );
}

function SharedSection({ route, onNavigate }) {
  useSyncExternalStore(subscribeShared, getSharedVersion);
  const others = getOthers();
  if (!others.length) return null;
  return (
    <>
      <div className="side-section">Shared with you</div>
      {others.map((s) => (
        <a key={s.owner.id + s.threadId} href={'#' + sharedPath(s.owner.id, s.threadId)} onClick={onNavigate}
          className={`side-thread shared ${route.name === 'shared' && route.id === s.threadId ? 'active' : ''}`}
          title={`${s.owner.name}: ${s.snapshot?.question || ''}`}>
          <span className="side-owner">{s.owner.name}</span>
          <span className="clamp">{s.snapshot?.question}</span>
        </a>
      ))}
    </>
  );
}

function SignedInAs() {
  const { user, mode } = getSessionInfo();
  if (!user || (mode === 'open' && user.role === 'owner')) return null;
  return (
    <div className="side-user">
      <span>{user.name}</span>
      <a href="/?logout" className="btn link"><Icon name="signout" size={14} /> Sign out</a>
    </div>
  );
}

export default function App() {
  useEffect(() => { startSharing(); }, []);
  const route = useRoute();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [route.name, route.id]);
  const exists = useRecord(() => (route.name === 'thread' ? !!R.getThread(route.id) : route.name === 'quest' ? !!R.getQuest(route.id) : true), [route.name, route.id]);
  useEffect(() => { if (!exists) go('/'); }, [exists]);

  let page;
  switch (route.name) {
    case 'thread': page = exists ? <ThreadPage key={route.id} id={route.id} /> : null; break;
    case 'new': page = <NewThread query={route.query} />; break;
    case 'shared': page = <SharedThread key={route.userId + route.id} userId={route.userId} id={route.id} />; break;
    case 'quests': page = <Quests />; break;
    case 'quest': page = exists ? <QuestPage key={route.id} id={route.id} /> : null; break;
    case 'promenade': page = <Promenade />; break;
    case 'library': page = <Library />; break;
    case 'settings': page = <Settings />; break;
    default: page = <Desk />;
  }
  return (
    <div className={`app ${drawer ? 'drawer-open' : ''}`}>
      <Sidebar route={route} onNavigate={() => setDrawer(false)} />
      <div className="main" onClick={() => drawer && setDrawer(false)}>
        <header className="topbar">
          <button className="menu-btn" aria-label="Menu" onClick={(e) => { e.stopPropagation(); setDrawer(true); }}><Icon name="menu" size={20} /></button>
          <a className="brand" href="#/"><Icon name="mosaic" size={18} className="brand-ic" />Mosaic</a>
        </header>
        {page}
      </div>
      <Reader />
    </div>
  );
}
