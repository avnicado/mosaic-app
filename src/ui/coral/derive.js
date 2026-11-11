// The reef's data: one colony per thread, read from the record. Pure, no React.
//
// The one rule: a colony grows only from measured movement. A session that was
// opened, a mark, a restatement judged cosmetic: none of these add anything.
//   real        sessions whose restatement the judge called real movement  → polyps
//   spawned     threads this one gave rise to                              → buds
//   reflections notes you wrote (session notes, item notes, a synthesis)   → pearls
//   depth       real / (real + cosmetic + 1), 0 to 1                       → how far the branches reach
//               The + 1 keeps one lucky session from filling the reef, and
//               rewording alone gives 0.
//   dormant     active and untouched for 30 days                           → bleached (data, not failure)
import * as R from '../../data/record.js';

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Deterministic: the same record draws the same reef on every visit.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Warm and cool reef hues, never neon. Each thread keeps its own.
export const HUES = [8, 24, 340, 292, 188, 150, 44, 218];

export function colonies({ threads, sessions, items }, now = Date.now()) {
  const children = new Map();
  for (const t of threads) if (t.parentId) children.set(t.parentId, (children.get(t.parentId) || 0) + 1);
  const sessionsBy = new Map();
  for (const s of sessions) (sessionsBy.get(s.threadId) || sessionsBy.set(s.threadId, []).get(s.threadId)).push(s);
  const itemNotes = new Map();
  for (const i of items) if (i.threadId && i.notes?.length) itemNotes.set(i.threadId, (itemNotes.get(i.threadId) || 0) + i.notes.length);

  return [...threads]
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .map((t) => {
      const mine = sessionsBy.get(t.id) || [];
      const done = mine.filter((s) => s.closedAt);
      const real = done.filter((s) => s.diff?.verdict === 'real').length;
      const cosmetic = done.filter((s) => s.diff?.verdict === 'cosmetic').length;
      const reflections = mine.filter((s) => (s.note || '').trim()).length + (itemNotes.get(t.id) || 0) + ((t.synthesis || '').trim() ? 1 : 0);
      const seed = hashStr(t.id);
      return {
        id: t.id,
        thread: t,
        question: R.currentArticulation(t),
        real, cosmetic, reflections,
        spawned: children.get(t.id) || 0,
        depth: real / (real + cosmetic + 1),
        dormant: R.isDormant(t, now),
        closed: t.status === 'closed',
        touchedAt: t.touchedAt || t.createdAt,
        seed,
        hue: HUES[seed % HUES.length],
      };
    });
}
