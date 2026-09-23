// Server sync for the user's record.
//
// The app reads and writes localStorage (via src/storage.js and a few direct
// calls). This module makes the server the source of truth without changing
// any of that code:
//   boot()  — before the app mounts: pull the record from /api/store into
//             localStorage (first run on a new server: push local data up).
//   then    — every localStorage write/remove of a "m2:*" key is queued
//             and flushed to /api/store (debounced). Failed flushes stay in a
//             persisted queue and are retried, including on the next visit.
// Last write wins per key — fine for one person.

const PREFIX = 'm2:';
const LOCAL_ONLY = new Set(['m2:ui']); // per-device UI state (open panels, drafts)
const QUEUE_KEY = 'm2-sync:queue'; // not "m2:" — never synced itself
const LAST_PULL_KEY = 'm2-sync:lastPull';
const FLUSH_DELAY_MS = 400;
const STALE_MS = 5 * 60 * 1000;

const proto = Storage.prototype;
const rawSet = proto.setItem;
const rawRemove = proto.removeItem;
const ls = () => window.localStorage;

const synced = (k) => typeof k === 'string' && k.startsWith(PREFIX) && !LOCAL_ONLY.has(k);

// queue: { key: true } — the current localStorage value (or its absence) is what gets sent
function loadQueue() {
  try { return JSON.parse(ls().getItem(QUEUE_KEY) || '{}') || {}; } catch { return {}; }
}
function saveQueue(q) {
  try { rawSet.call(ls(), QUEUE_KEY, JSON.stringify(q)); } catch {}
}

let queue = {};
let timer = null;
let flushing = false;
let retryMs = 2000;
let onStatus = () => {};

function status(s) { try { onStatus(s); } catch {} }

function localKeys() {
  const out = [];
  const s = ls();
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (synced(k)) out.push(k);
  }
  return out;
}

function schedule(delay = FLUSH_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(flush, delay);
}

function mark(key) {
  queue[key] = true;
  saveQueue(queue);
  status('pending');
  schedule();
}

async function flush({ keepalive = false } = {}) {
  if (flushing) { schedule(); return; }
  const keys = Object.keys(queue);
  if (!keys.length) { status('saved'); return; }
  flushing = true;
  const set = {};
  const del = [];
  for (const k of keys) {
    const v = ls().getItem(k);
    if (v === null) del.push(k); else set[k] = v;
  }
  try {
    const res = await fetch('/api/store', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ set, del }),
      keepalive,
    });
    if (res.status === 401) { status('signed-out'); return; }
    if (!res.ok) throw new Error(`store ${res.status}`);
    // Only clear keys that weren't re-dirtied while the request was in flight.
    for (const k of keys) {
      const cur = ls().getItem(k);
      if ((cur === null && del.includes(k)) || (cur !== null && set[k] === cur)) delete queue[k];
    }
    saveQueue(queue);
    retryMs = 2000;
    status(Object.keys(queue).length ? 'pending' : 'saved');
    if (Object.keys(queue).length) schedule();
  } catch (e) {
    console.warn('[sync] flush failed, will retry:', e.message);
    status('offline');
    schedule(retryMs);
    retryMs = Math.min(retryMs * 2, 60000);
  } finally {
    flushing = false;
  }
}

function install() {
  proto.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === ls() && synced(k)) mark(k);
  };
  proto.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === ls() && synced(k)) mark(k);
  };
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      if (Object.keys(queue).length) flush({ keepalive: true });
      return;
    }
    // Back after a while: another device may have written. If nothing local
    // is unsent and the server record differs, reload so the app re-reads it.
    const last = Number(ls().getItem(LAST_PULL_KEY) || 0);
    if (Date.now() - last < STALE_MS || Object.keys(queue).length) return;
    try {
      const server = await pull();
      if (server && applyServer(server)) location.reload();
    } catch {}
  });
}

async function pull() {
  const res = await fetch('/api/store', { cache: 'no-store' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`store ${res.status}`);
  const { data } = await res.json();
  rawSet.call(ls(), LAST_PULL_KEY, String(Date.now()));
  return data || {};
}

// Make localStorage match the server (except unsent local keys). Returns true if anything changed.
function applyServer(server) {
  let changed = false;
  for (const k of localKeys()) {
    if (!(k in server) && !queue[k]) { rawRemove.call(ls(), k); changed = true; }
  }
  for (const [k, v] of Object.entries(server)) {
    if (!synced(k) || queue[k]) continue;
    if (ls().getItem(k) !== v) { rawSet.call(ls(), k, v); changed = true; }
  }
  return changed;
}

export function onSyncStatus(fn) { onStatus = fn; }

// Returns { ok: true } or { ok: false, reason }.
// Which user this browser's local copy belongs to. When someone else signs
// in on the same browser, the previous person's local copy is wiped first —
// records are private per user.
const USER_KEY = 'm2-sync:user';

export function wipeLocal() {
  const s = ls();
  const doomed = [];
  for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && (k.startsWith(PREFIX) || k.startsWith('m2-sync:'))) doomed.push(k); }
  for (const k of doomed) rawRemove.call(s, k);
  queue = {};
}

export async function boot(userId = 'owner') {
  const owner = ls().getItem(USER_KEY);
  // No marker yet: data written before accounts existed belongs to the owner.
  if (owner ? owner !== userId : userId !== 'owner') wipeLocal();
  rawSet.call(ls(), USER_KEY, userId);
  queue = loadQueue();
  let server;
  try {
    server = await pull();
  } catch (e) {
    // Offline or store not configured: run on local data; queued writes go up later.
    console.warn('[sync] pull failed, running on local data:', e.message);
    install();
    status('offline');
    schedule(retryMs);
    return { ok: true, offline: true };
  }
  if (server === null) return { ok: false, reason: 'signed-out' };

  const serverHasRecord = Object.keys(server).some(synced);
  if (!serverHasRecord) {
    // First sign-in against an empty store: this browser's record becomes the record.
    for (const k of localKeys()) queue[k] = true;
    saveQueue(queue);
  } else {
    applyServer(server);
  }
  install();
  if (Object.keys(queue).length) schedule(0); else status('saved');
  return { ok: true };
}

export function flushNow() { return flush(); }
