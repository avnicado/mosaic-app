// TEMPORARY visual check of the views on a thread's page. Removed after checking.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/app.css';
import '../ui/thread/thread.css';
import { setSessionInfo } from '../session.js';
import ThreadViews from '../ui/views/ThreadViews.jsx';

setSessionInfo({ user: { id: 'owner', role: 'owner', name: 'Test' }, mode: 'open' });
const q = new URLSearchParams(location.search).get('q') || 'How valuable are vaccines?';
const thread = { id: 'test', status: 'active', articulations: [{ text: q, at: Date.now() }], reading: null };
createRoot(document.getElementById('root')).render(
  <div className="app"><nav className="sidebar"><span className="brand">Mosaic</span></nav>
    <div className="main"><div className="page wide th-page"><div className="th-layout">
      <div className="th-main"><div className="th-o-now"><h1>{q}</h1><p>(the thread's own question block)</p><ThreadViews thread={thread} /></div></div>
      <aside className="th-rail"><h3>Reading</h3><p>rail</p></aside>
    </div></div></div></div>
);
