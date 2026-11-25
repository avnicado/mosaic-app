// TEMPORARY preview-only page (to be removed before merge): the real app on
// made-up sample data, no sign-in, nothing sent to the server. ?lang=he|en.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setSessionInfo } from '../session.js';

const realFetch = window.fetch.bind(window);
window.fetch = (url, opts) => {
  const u = String(url);
  if (u.startsWith('/api/corpus')) return realFetch('/corpus.json');
  if (u.startsWith('/api/session')) return Promise.resolve(new Response(JSON.stringify({ authed: true, mode: 'password', store: 'kv', user: { id: 'owner', name: 'Gil', role: 'owner' } }), { status: 200 }));
  if (u.startsWith('/api/')) return Promise.resolve(new Response(JSON.stringify({ error: { message: 'Preview: no server' } }), { status: 401 }));
  return realFetch(url, opts);
};

const q = new URLSearchParams(location.search);
localStorage.clear();
const lang = q.get('lang') || 'he';
localStorage.setItem('m2:lang', lang);
const H = 3600e3, D = 24 * H, now = Date.now();
const put = (k, v) => localStorage.setItem('m2:' + k, JSON.stringify(v));

const Q1a = 'How valuable is vaccination, really?';
const Q1 = 'How valuable are vaccines?';
put('thread:t1', {
  id: 't1', articulations: [{ text: Q1a, at: now - 9 * D, sessionId: null }, { text: Q1, at: now - 2 * D, sessionId: 's1' }],
  reading: { presuppositions: ['That "value" can be measured on one scale', 'That vaccines are one thing rather than many'], absent: ['Who bears the cost when uptake falls', 'How value differs between rich and poor countries'], domain: 'medicine & health', questionType: 'evaluative', register: 'plain', mode: 'contested' },
  readAt: now - 2 * D, corrections: { rejected: [], added: [], note: '' }, status: 'active', synthesis: '', closedAt: null,
  parentId: null, spawnAnchor: null, seed: null, image: null, createdAt: now - 9 * D, touchedAt: now - 1 * H,
});
const items = [
  ['sharpen', 'The measles resurgence, in numbers', 'Our World in Data', 'https://ourworldindata.org/measles', 'article', 'Separates the value of a vaccine from the value of high coverage.'],
  ['complicate', 'What the HPV vaccine debate got wrong', 'Aeon', 'https://aeon.co/essays/hpv', 'essay', 'Argues that trust, not evidence, decides uptake.'],
  ['bridge', 'Herd immunity and the tragedy of the commons', 'Nautilus', 'https://nautil.us/commons', 'podcast', 'The same free-rider shape shows up in fisheries.'],
  ['ground', 'One clinic in rural Malawi', 'YouTube', 'https://www.youtube.com/watch?v=abc', 'video', 'A cold chain that breaks twice a week.'],
];
const mk = (sid, base, kept) => items.map(([slot, title, source, url, mediaType, why], i) => {
  const id = `${sid}i${i}`;
  put('item:' + id, { id, threadId: 't1', sessionId: sid, slot, title, source, url, mediaType, preview: '', why, provenance: 'search', linkCheck: 'ok', signal: i === 0 ? 'moved' : i === 2 ? 'neutral' : null, kept: kept && i === 1, openedAt: i === 0 ? base + H : null, rating: i === 0 ? { informative: 3, profound: 2 } : {}, notes: i === 0 ? [{ text: 'Coverage matters more than the shot itself.', at: base + 2 * H }] : [], createdAt: base });
  return id;
});
put('session:s1', { id: 's1', threadId: 't1', openedAt: now - 9 * D, closedAt: now - 2 * D, articulationAtOpen: Q1a, articulationAtClose: Q1, itemIds: mk('s1', now - 9 * D, true), diff: { verdict: 'real', why: 'You moved from one vaccine to vaccines as a set of choices.', moves: [{ label: 'Widened', content: 'from one shot to all of them' }] }, note: '' });
put('session:s2', { id: 's2', threadId: 't1', openedAt: now - 1 * H, closedAt: null, articulationAtOpen: Q1, articulationAtClose: null, itemIds: mk('s2', now - 1 * H, false), diff: null, note: '' });
put('thread:t2', { id: 't2', articulations: [{ text: 'Why do some cities feel walkable and others never do?', at: now - 40 * D, sessionId: null }], reading: null, readAt: null, corrections: { rejected: [], added: [], note: '' }, status: 'active', synthesis: '', closedAt: null, parentId: null, createdAt: now - 40 * D, touchedAt: now - 35 * D });
put('quest:q1', { id: 'q1', title: 'Learn how batteries store energy', learner: { level: 'curious beginner', background: '', known: [], interests: [], avoid: [], prefers: [] }, map: [{ id: 'm1', title: 'What a chemical cell is', why: 'Everything else builds on it.', status: 'exploring', threadId: null, at: now - D }, { id: 'm2', title: 'Why lithium', why: 'The light metal that changed phones.', status: 'open', threadId: null, at: now - D }], messages: [{ id: 'g1', role: 'guide', text: 'Where would you like to start?', at: now - D }], status: 'active', createdAt: now - 2 * D, touchedAt: now - D });
put('settings', { ratings: true });

setSessionInfo({ authed: true, mode: 'password', user: { id: 'owner', name: 'Gil', role: 'owner' } });

import('../ui/App.jsx').then(({ default: App }) => {
  createRoot(document.getElementById('root')).render(<App />);
});
