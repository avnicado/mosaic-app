// The record: threads, sessions, items — one localStorage key per document
// ("m2:thread:<id>", "m2:session:<id>", "m2:item:<id>", plus "m2:pledge",
// "m2:settings"). src/sync.js mirrors every "m2:*" key to the server, so this
// module only ever talks to localStorage, synchronously. React subscribes via
// useRecord() (src/data/hooks.js); every write bumps a version and notifies.
//
// Shapes
//   thread  { id, articulations:[{text, at, sessionId|null}], reading, readAt,
//             corrections:{rejected:[text], added:[{field:'absent'|'presuppositions', text}], note},
//             status:'active'|'closed', synthesis, closedAt, parentId, spawnAnchor:{itemId,title,url},
//             seed:{title,source,url,why,excerpt}|null, image:{observation,thumbnail}|null,
//             createdAt, touchedAt }
//   session { id, threadId, openedAt, closedAt|null, articulationAtOpen, articulationAtClose,
//             itemIds:[id], diff:{verdict,why,moves}|null, note }
//   item    { id, threadId, sessionId, slot, title, source, url, mediaType, preview, why,
//             provenance:'search'|'knowledge', linkCheck, failed, error,
//             signal:'moved'|'neutral'|'closed'|null, kept, openedAt, rating:{axis:0-4},
//             notes:[{text, at}], replacedBy, createdAt,
//             progress: how much you read/watched/listened (src/data/progress.js) }

const P = 'm2:';
export const DORMANT_MS = 30 * 24 * 3600 * 1000;

// ---- change notification ---------------------------------------------------
let version = 0;
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getVersion() { return version; }
function changed() { version++; for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }
// Another tab or a sync pull changed storage underneath us.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (!e.key || e.key.startsWith(P)) changed(); });
export const notifyExternalChange = changed;

// ---- raw access --------------------------------------------------------------
const ls = () => window.localStorage;
function read(key) { try { const v = ls().getItem(P + key); return v == null ? null : JSON.parse(v); } catch { return null; } }
function write(key, val) { ls().setItem(P + key, JSON.stringify(val)); }
function remove(key) { ls().removeItem(P + key); }
function keysWith(prefix) {
  const out = [];
  const s = ls();
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.startsWith(P + prefix)) out.push(k.slice(P.length)); }
  return out;
}
const all = (kind) => keysWith(kind + ':').map((k) => read(k)).filter(Boolean);

export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- reads -------------------------------------------------------------------
export const getThread = (id) => read(`thread:${id}`);
export const getSession = (id) => read(`session:${id}`);
export const getItem = (id) => read(`item:${id}`);
export const allThreads = () => all('thread');
export const allSessions = () => all('session');
export const allItems = () => all('item');

export const currentArticulation = (t) => t?.articulations?.[t.articulations.length - 1]?.text || '';
export const isDormant = (t, now = Date.now()) => t.status === 'active' && now - (t.touchedAt || t.createdAt) > DORMANT_MS;

// Newest-touched first.
export function listThreads() {
  return allThreads().sort((a, b) => (b.touchedAt || b.createdAt) - (a.touchedAt || a.createdAt));
}
export function sessionsFor(threadId) {
  return allSessions().filter((s) => s.threadId === threadId).sort((a, b) => a.openedAt - b.openedAt);
}
export function openSessionFor(threadId) {
  return sessionsFor(threadId).filter((s) => !s.closedAt).pop() || null;
}
export function openSessions() {
  return allSessions().filter((s) => !s.closedAt).sort((a, b) => b.openedAt - a.openedAt);
}
export function itemsFor(threadId) {
  return allItems().filter((i) => i.threadId === threadId).sort((a, b) => a.createdAt - b.createdAt);
}
// The live items of a session, in slot order (replaced items excluded).
export function sessionItems(session) {
  return (session?.itemIds || []).map(getItem).filter(Boolean);
}
export const keptItems = (threadId) => itemsFor(threadId).filter((i) => i.kept);
export const childrenOf = (threadId) => allThreads().filter((t) => t.parentId === threadId);

// ---- writes ------------------------------------------------------------------
export function putThread(t) { write(`thread:${t.id}`, t); changed(); return t; }
export function putSession(s) { write(`session:${s.id}`, s); changed(); return s; }
export function putItem(i) { write(`item:${i.id}`, i); changed(); return i; }

export function patchThread(id, patch) {
  const t = getThread(id); if (!t) return null;
  return putThread({ ...t, ...(typeof patch === 'function' ? patch(t) : patch) });
}
export function patchSession(id, patch) {
  const s = getSession(id); if (!s) return null;
  return putSession({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) });
}
export function patchItem(id, patch) {
  const i = getItem(id); if (!i) return null;
  return putItem({ ...i, ...(typeof patch === 'function' ? patch(i) : patch) });
}
export const touch = (threadId) => patchThread(threadId, { touchedAt: Date.now() });

export function newThread({ text, reading = null, seed = null, image = null, parentId = null, spawnAnchor = null }) {
  const now = Date.now();
  return putThread({
    id: genId(), articulations: [{ text: text.trim(), at: now, sessionId: null }],
    reading, readAt: reading ? now : null, corrections: { rejected: [], added: [], note: '' },
    status: 'active', synthesis: '', closedAt: null, parentId, spawnAnchor, seed, image,
    createdAt: now, touchedAt: now,
  });
}

export function deleteThread(id) {
  for (const s of sessionsFor(id)) remove(`session:${s.id}`);
  for (const i of itemsFor(id)) remove(`item:${i.id}`);
  remove(`thread:${id}`);
  changed();
}

export function deleteEverything() {
  for (const k of keysWith('')) remove(k);
  changed();
}

// ---- small documents -----------------------------------------------------------
export const getPledge = () => read('pledge');
export const setPledge = (p) => { if (p) write('pledge', p); else remove('pledge'); changed(); };
export const getSettings = () => ({ ratings: true, ...(read('settings') || {}) });
export const setSettings = (patch) => { write('settings', { ...getSettings(), ...patch }); changed(); };

// Per-device UI state (not synced — see LOCAL_ONLY in sync.js).
export const getUI = () => read('ui') || {};
export const setUI = (patch) => { write('ui', { ...getUI(), ...patch }); };

// ---- export / import -----------------------------------------------------------
export function exportRecord() {
  return {
    format: 'mosaic-record', version: 2, exportedAt: new Date().toISOString(),
    threads: allThreads(), sessions: allSessions(), items: allItems(),
    pledge: getPledge(), settings: read('settings'),
  };
}

// Merge a record file. v2: documents by id (incoming wins when newer).
// v1 (the old demo's export): converted — see fromV1.
export function importRecord(rec) {
  if (!rec || rec.format !== 'mosaic-record') throw new Error('That file is not a Mosaic record export.');
  const data = rec.version === 2 ? rec : fromV1(rec);
  const newer = (a, b) => !a || (b.touchedAt || b.closedAt || b.openedAt || b.createdAt || 0) >= (a.touchedAt || a.closedAt || a.openedAt || a.createdAt || 0);
  let counts = { threads: 0, sessions: 0, items: 0 };
  for (const t of data.threads || []) if (newer(getThread(t.id), t)) { write(`thread:${t.id}`, t); counts.threads++; }
  for (const s of data.sessions || []) if (newer(getSession(s.id), s)) { write(`session:${s.id}`, s); counts.sessions++; }
  for (const i of data.items || []) if (!getItem(i.id)) { write(`item:${i.id}`, i); counts.items++; }
  if (data.pledge && !getPledge()) write('pledge', data.pledge);
  changed();
  return counts;
}

// The old demo stored threads with nested sessions, feeds as arrays, signals
// keyed by feed index ('sharpen'|'neutral'|'close'), and diffs as
// diffVerdict/diffMoves. Convert to v2 documents.
export function fromV1(rec) {
  const SIG = { sharpen: 'moved', neutral: 'neutral', close: 'closed' };
  const threads = [], sessions = [], items = [];
  const ratings = rec.ratings || {};
  for (const t of rec.threads || []) {
    const ss = (t.sessions || []).slice().sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
    const arts = [{ text: t.originalQuestion || t.currentQuestion || '(untitled)', at: t.createdAt || Date.now(), sessionId: null }];
    let lastReading = null;
    for (const s of ss) {
      const itemIds = [];
      (s.feed || []).forEach((f, idx) => {
        if (!f || f.failed) return;
        const id = `${s.id}-${idx}`;
        const { at: _ratedAt, ...r } = ratings[f.url] || ratings[f.title] || {};
        items.push({
          id, threadId: t.id, sessionId: s.id, slot: f.slot, title: f.title || '', source: f.source || '', url: f.url || '',
          mediaType: f.mediaType || 'essay', preview: f.preview || '', why: f.why || '',
          provenance: f.provenance || 'search', linkCheck: f.linkCheck || 'unknown', failed: false,
          signal: SIG[(s.signals || {})[idx]] || null, kept: false, openedAt: null,
          rating: Object.keys(r).length ? r : null, notes: [], replacedBy: null, createdAt: s.startedAt || Date.now(),
        });
        itemIds.push(id);
      });
      const closed = !!s.questionAtClose;
      sessions.push({
        id: s.id, threadId: t.id, openedAt: s.startedAt || Date.now(), closedAt: (s.startedAt || Date.now()) + 1, // every v1 session ended (restated or skipped)
        articulationAtOpen: s.questionAtOpen || '', articulationAtClose: s.questionAtClose || null, itemIds,
        diff: s.diffVerdict ? { verdict: s.diffVerdict, why: s.diffVerdictWhy || '', moves: s.diffMoves || [] } : null,
        note: s.reviewNote || '',
      });
      if (closed && s.questionAtClose !== arts[arts.length - 1].text) arts.push({ text: s.questionAtClose, at: (s.startedAt || Date.now()) + 1, sessionId: s.id });
      if (s.characterization) lastReading = s.characterization;
    }
    const r = lastReading && {
      domain: lastReading.domain || '', questionType: lastReading.questionType || '', mode: lastReading.mode === 'explore' ? 'explore' : 'question',
      register: lastReading.register || 'curious', presuppositions: lastReading.presuppositions || [], absent: lastReading.absent || [],
      openingMove: lastReading.openingMove || '',
    };
    threads.push({
      id: t.id, articulations: arts, reading: r || null, readAt: r ? (t.lastSessionAt || Date.now()) : null,
      corrections: { rejected: [], added: [], note: '' }, status: 'active', synthesis: '', closedAt: null,
      parentId: t.parentThreadId || null,
      spawnAnchor: t.spawnAnchor ? { itemId: null, title: t.spawnAnchor.title, url: t.spawnAnchor.url } : null,
      seed: t.seedItem ? { title: t.seedItem.title, source: t.seedItem.source, url: t.seedItem.url, why: t.seedItem.why, excerpt: '' } : null,
      image: t.artifactSummary ? { observation: t.artifactSummary.observation || '', thumbnail: t.artifactSummary.thumbnail || null } : null,
      createdAt: t.createdAt || Date.now(), touchedAt: t.lastSessionAt || t.createdAt || Date.now(),
    });
  }
  // v1 pledge: { bar: <one number for profound & ethical>, months, startedAt } → v2 { bar:{axis:n}, startedAt, endsAt, months }
  const p = rec.pledge;
  let pledge = null;
  if (p && typeof p.bar === 'number') {
    const start = p.startedAt || Date.now();
    const end = new Date(start); end.setMonth(end.getMonth() + (p.months || 6));
    pledge = { bar: { profound: p.bar, ethical: p.bar }, startedAt: start, endsAt: end.getTime(), months: p.months || 6 };
  } else if (p) pledge = p;
  return { threads, sessions, items, pledge };
}
