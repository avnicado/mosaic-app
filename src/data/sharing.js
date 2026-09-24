// Opt-in, read-only sharing of a thread with the other people on this Mosaic.
// A thread with `shared: true` is published as a snapshot to /api/shared and
// kept current (debounced) as it changes; turning sharing off or deleting the
// thread unpublishes it. What others see: the question and its history, the
// reading, each finished session (before → after, verdict, moves, the items
// marked ✦/–, the session note), kept items with their notes, and the synthesis.

import * as R from './record.js';

let mine = null;              // threadIds currently published by me (server truth)
const lastSent = new Map();   // threadId → JSON of last published snapshot
let timer = null;
let started = false;

// Shared-with-me cache for the UI.
let others = [];
let othersLoaded = false;
const listeners = new Set();
let version = 0;
export const subscribeShared = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSharedVersion = () => version;
export const getOthers = () => others;
export const othersReady = () => othersLoaded;
const notify = () => { version++; for (const fn of listeners) fn(); };

export function snapshotOf(threadId) {
  const t = R.getThread(threadId);
  if (!t) return null;
  const items = Object.fromEntries(R.itemsFor(threadId).map((i) => [i.id, i]));
  const pick = (i) => ({ slot: i.slot, title: i.title, url: i.url, source: i.source, mediaType: i.mediaType || null, signal: i.signal || null });
  const sessions = R.sessionsFor(threadId).filter((s) => s.closedAt).map((s) => ({
    openedAt: s.openedAt, closedAt: s.closedAt,
    before: s.articulationAtOpen, after: s.articulationAtClose,
    diff: s.diff, note: s.note || '',
    items: (s.itemIds || []).map((id) => items[id]).filter((i) => i && !i.failed && (i.signal === 'moved' || i.signal === 'closed')).map(pick),
  }));
  const kept = Object.values(items).filter((i) => i.kept && !i.failed).map((i) => ({ ...pick(i), notes: (i.notes || []).map((n) => n.text) }));
  return {
    question: R.currentArticulation(t),
    articulations: t.articulations,
    reading: t.reading,
    status: t.status, synthesis: t.synthesis || '', closedAt: t.closedAt || null,
    createdAt: t.createdAt, touchedAt: t.touchedAt,
    seed: t.seed ? { title: t.seed.title, source: t.seed.source, url: t.seed.url } : null,
    sessions, kept,
  };
}

async function post(body) {
  const res = await fetch('/api/shared', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`share failed (${res.status})`);
}

async function publish() {
  timer = null;
  if (mine === null) return;
  const wanted = new Set(R.allThreads().filter((t) => t.shared).map((t) => t.id));
  for (const id of wanted) {
    const snap = snapshotOf(id);
    const json = JSON.stringify(snap);
    if (lastSent.get(id) === json && mine.has(id)) continue;
    try { await post({ threadId: id, snapshot: snap }); lastSent.set(id, json); mine.add(id); } catch (e) { console.warn('[share]', e.message); }
  }
  for (const id of [...mine]) {
    if (wanted.has(id)) continue;
    try { await post({ threadId: id, remove: true }); mine.delete(id); lastSent.delete(id); } catch (e) { console.warn('[share]', e.message); }
  }
}
const schedule = () => { clearTimeout(timer); timer = setTimeout(publish, 1500); };

export async function refreshShared() {
  try {
    const res = await fetch('/api/shared', { cache: 'no-store' });
    if (!res.ok) return;
    const j = await res.json();
    mine = new Set(j.mine || []);
    others = j.others || [];
    othersLoaded = true;
    notify();
  } catch { /* offline */ }
}

export function startSharing() {
  if (started) return;
  started = true;
  refreshShared().then(schedule);
  R.subscribe(schedule);
  // Others' shared threads change on their devices; refresh when we come back to the tab.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshShared(); });
}

export const setShared = (threadId, on) => R.patchThread(threadId, { shared: !!on });
