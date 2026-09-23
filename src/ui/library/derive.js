// Pure reads over the record for the Library. No React, no writes.
import * as R from '../../data/record.js';

const DAY = 864e5;
export const SLOT_ORDER = ['sharpen', 'complicate', 'bridge', 'ground'];

// Monday 00:00 local of the week containing ts.
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Everything the Library needs, in one pass over the record.
export function snapshot() {
  const threads = R.listThreads();
  const sessions = R.allSessions();
  const items = R.allItems();
  return { threads, sessions, items };
}

// thread × week grid for the last `n` weeks (oldest first).
export function weekGrid({ threads, sessions, items }, n = 16, now = Date.now()) {
  const last = weekStart(now);
  const weeks = Array.from({ length: n }, (_, k) => last - (n - 1 - k) * 7 * DAY);
  // Weeks shift by DST hours; bucket by nearest week start.
  const idxOf = (ts) => {
    if (!ts) return -1;
    const w = weekStart(ts);
    return weeks.findIndex((x) => Math.abs(x - w) < DAY);
  };
  const sessById = Object.fromEntries(sessions.map((s) => [s.id, s]));
  const rows = threads.map((t) => {
    const cells = weeks.map((start) => ({ start, sessions: 0, marked: 0, moved: 0, restated: 0, real: 0, cosmetic: 0, kept: 0, closedThread: false, created: false }));
    const at = (ts, fn) => { const i = idxOf(ts); if (i >= 0) fn(cells[i]); };
    for (const s of sessions) {
      if (s.threadId !== t.id) continue;
      at(s.openedAt, (c) => c.sessions++);
      if (s.closedAt && s.diff?.verdict === 'real') at(s.closedAt, (c) => c.real++);
      if (s.closedAt && s.diff?.verdict === 'cosmetic') at(s.closedAt, (c) => c.cosmetic++);
    }
    for (const i of items) {
      if (i.threadId !== t.id) continue;
      const ts = i.openedAt || sessById[i.sessionId]?.openedAt || i.createdAt;
      if (i.signal) at(ts, (c) => { c.marked++; if (i.signal === 'moved') c.moved++; });
      if (i.kept) at(ts, (c) => c.kept++);
    }
    (t.articulations || []).slice(1).forEach((a) => at(a.at, (c) => c.restated++));
    at(t.createdAt, (c) => { c.created = true; });
    if (t.status === 'closed') at(t.closedAt, (c) => { c.closedThread = true; });
    for (const c of cells) c.activity = c.sessions + c.marked + c.restated;
    return { thread: t, cells, any: cells.some((c) => c.activity || c.created || c.closedThread) };
  });
  return { weeks, rows };
}

// ✦ / ○ / – per slot, across everything.
export function slotSignals(items) {
  const out = Object.fromEntries(SLOT_ORDER.map((s) => [s, { moved: 0, neutral: 0, closed: 0, shown: 0 }]));
  for (const i of items) {
    const o = out[i.slot]; if (!o) continue;
    if (!i.failed) o.shown++;
    if (i.signal && o[i.signal] != null) o[i.signal]++;
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[“”"'‘’.,;:!?()\[\]]/g, '')
  .replace(/^(that|the|a|an)\s+/, '')
  .replace(/\s+/g, ' ').trim();

// Readings' presuppositions / absences that come up in more than one thread.
export function recurring(threads, field) {
  const groups = new Map();
  for (const t of threads) {
    for (const text of t.reading?.[field] || []) {
      const k = norm(text); if (!k) continue;
      const g = groups.get(k) || { text, threads: new Map() };
      g.threads.set(t.id, t);
      groups.set(k, g);
    }
  }
  const rejected = new Set(threads.flatMap((t) => (t.corrections?.rejected || []).map(norm)));
  return [...groups.entries()]
    .map(([k, g]) => ({ text: g.text, threads: [...g.threads.values()], rejectedElsewhere: rejected.has(k) }))
    .filter((g) => g.threads.length > 1)
    .sort((a, b) => b.threads.length - a.threads.length || a.text.localeCompare(b.text));
}

// Your corrections to the readings. No timestamps are stored on corrections, so
// "recent" means: from the most recently active threads, latest entry first.
export function corrections(threads) {
  let rejected = 0, addedPre = 0, addedAbsent = 0, notes = 0;
  const recent = [];
  for (const t of threads) { // threads arrive newest-touched first
    const c = t.corrections || {};
    rejected += (c.rejected || []).length;
    for (const a of c.added || []) (a.field === 'presuppositions' ? addedPre++ : addedAbsent++);
    if ((c.note || '').trim()) notes++;
    const mine = [
      ...(c.rejected || []).map((text) => ({ kind: 'rejected', text })),
      ...(c.added || []).map((a) => ({ kind: a.field === 'presuppositions' ? 'added-pre' : 'added-absent', text: a.text })),
    ].reverse();
    if ((c.note || '').trim()) mine.push({ kind: 'note', text: c.note.trim() });
    for (const m of mine) recent.push({ ...m, thread: t });
  }
  return { rejected, addedPre, addedAbsent, notes, recent: recent.slice(0, 5) };
}

// Verdicts across finished sessions, plus the kinds of move named in real ones.
export function verdicts(sessions) {
  const done = sessions.filter((s) => s.closedAt);
  const real = done.filter((s) => s.diff?.verdict === 'real');
  const cosmetic = done.filter((s) => s.diff?.verdict === 'cosmetic').length;
  const moves = new Map();
  for (const s of real) for (const m of s.diff?.moves || []) {
    const k = (m.label || '').trim(); if (!k) continue;
    moves.set(k, (moves.get(k) || 0) + 1);
  }
  return {
    finished: done.length, real: real.length, cosmetic, unjudged: done.length - real.length - cosmetic,
    open: sessions.length - done.length,
    moves: [...moves.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

export const joinWords = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const fmtDate = (ts, opts = {}) => (ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...opts }) : '');
