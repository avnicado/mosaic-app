// TEMPORARY visual check of ring items on a thread's page. Removed after checking.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/app.css';
import '../ui/thread/thread.css';
import { setSessionInfo } from '../session.js';
import * as R from '../data/record.js';
import ThreadViews from '../ui/views/ThreadViews.jsx';
import { useRecord } from '../data/hooks.js';
import { normalizeMap } from '../engine/viewsDemo.js';

const realFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const u = String(url);
  if (u.endsWith('/api/search')) {
    await new Promise((r) => setTimeout(r, 1200));
    return new Response(JSON.stringify({ results: [
      { title: 'Vaccine ingredients: what the science says', url: 'https://www.example.org/ingredients', snippet: 'Aluminium adjuvants have been used for decades. Studies of millions of doses find no link to chronic illness. Critics still question cumulative exposure.' },
      { title: 'Debate: are adjuvants safe?', url: 'https://www.youtube.com/watch?v=abc', snippet: 'Two doctors on adjuvant safety and what remains unknown about long-term exposure.' },
      { title: 'Thimerosal and childhood vaccines: a review', url: 'https://pubmed.ncbi.nlm.nih.gov/123', snippet: 'A review of studies on thimerosal, removed from most childhood vaccines in 2001, and what they found.' },
    ] }), { status: 200 });
  }
  if (u.endsWith('/api/checkurl')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
  if (u.includes('/api/store')) return new Response('{}', { status: 200 });
  return realFetch(url, init);
};
setSessionInfo({ user: { id: 'owner', role: 'owner', name: 'Test' }, mode: 'open' });
const q = 'Are vaccines worth it for kids today?';
const t = R.newThread({ text: q });
const map = normalizeMap({ status: 'mapped', question: q, live: true, headline: 'Four main views; they split most on safety and mandates.',
  views: [
    { id: 'pro', name: 'Pro', short: 'Pro', summary: 'Vaccines are safe and needed.', holders: 'Doctors', reasons: [], sources: [] },
    { id: 'anti', name: 'Anti', short: 'Anti', summary: 'Vaccines do more harm.', holders: 'Some groups', reasons: [], sources: [] },
    { id: 'cond', name: 'Conditional', short: 'Conditional', summary: 'Some, not all.', holders: 'Some doctors', reasons: [], sources: [] },
    { id: 'hes', name: 'Vaccine hesitant', short: 'Hesitant', summary: 'Unsure.', holders: 'Many parents', reasons: [], sources: [] },
  ],
  cruxes: [
    { id: 'c1', question: 'Do mandates protect public health?', left: 'Yes', right: 'No', positions: { pro: 'left', anti: 'right', cond: 'mid', hes: 'right' }, reading: [] },
    { id: 'c2', question: 'Is the schedule too crowded?', left: 'No', right: 'Yes', positions: { pro: 'left', anti: 'right', cond: 'right', hes: 'mid' }, reading: [] },
    { id: 'c3', question: 'Are current vaccine ingredients safe?', left: 'All proven safe', right: 'Some are unsafe', why: 'Ingredient concerns drive many objections.', positions: { pro: 'left', anti: 'right', cond: 'mid', hes: 'mid' }, reading: [] },
  ] }, { question: q });
map.live = true;
R.patchThread(t.id, { reading: {}, viewsMap: { text: q, status: 'mapped', map, open: true, at: Date.now() } });
function App() {
  const th = useRecord(() => R.getThread(t.id), []);
  return (
    <div className="app"><nav className="sidebar"><span className="brand">Mosaic</span></nav>
      <div className="main"><div className="page wide th-page"><div className="th-layout">
        <div className="th-main"><div className="th-o-now"><h1>{q}</h1><ThreadViews thread={th} /></div></div>
        <aside className="th-rail"><h3>Reading</h3><p>rail</p></aside>
      </div></div></div></div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
