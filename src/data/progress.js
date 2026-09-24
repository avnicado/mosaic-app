// How much of an item you actually read, watched or listened to, recorded by
// the reader (src/ui/reader/useProgress.js) on the item as `progress`:
//
//   progress { kind:'read'|'watch'|'listen',
//              ms,          active time: reading with the tab in view and not idle,
//                           or the player playing
//              depth,       articles: how far down the article you got (0–1)
//              minutes,     articles: the article's estimated reading time
//              spans,       players: the parts that actually played, [[from, to]] in seconds, merged
//              dur, pos,    players: length and last position, in seconds
//              estimated,   true when the player tells Mosaic nothing (TED, Apple, …):
//                           ms is then time with the player open after you pressed into it
//              visits, firstAt, lastAt }

import * as R from './record.js';

// Merge [from, to] spans into a sorted, non-overlapping list.
export function mergeSpans(spans) {
  const s = spans.filter(([a, b]) => b > a).map(([a, b]) => [a, b]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const sp of s) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1] + 0.5) last[1] = Math.max(last[1], sp[1]);
    else out.push(sp);
  }
  return out.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
}
export const covered = (spans) => (spans || []).reduce((n, [a, b]) => n + (b - a), 0);

// 0–1, or null when the tracker can't know (estimated, or no length yet).
export function doneOf(p) {
  if (!p) return null;
  if (p.kind === 'read') return p.depth ?? null;
  if (p.estimated || !p.dur) return null;
  return Math.min(1, covered(p.spans) / p.dur);
}

const VERB = { read: 'read', watch: 'watched', listen: 'listened to' };
export function minutesText(ms) {
  const m = Math.round(ms / 60000);
  if (ms < 45000) return 'under 1 min';
  if (m < 60) return `${Math.max(1, m)} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
}

// "read 80% · 6 of ~12 min", "watched 42% · 12 min", "about 9 min with the player".
export function progressText(p) {
  if (!p || (!p.ms && !covered(p.spans) && !p.depth)) return '';
  const done = doneOf(p);
  if (p.estimated) return `about ${minutesText(p.ms)} with the player`;
  const pct = done == null ? '' : `${VERB[p.kind]} ${done >= 0.97 ? 'all' : Math.round(done * 100) + '%'}`;
  const time = p.kind === 'read' && p.minutes ? `${minutesText(p.ms)} of ~${p.minutes} min` : minutesText(p.ms);
  return [pct || VERB[p.kind], time].join(' · ');
}

// Merge a tracker's delta into the stored progress. delta: { kind, ms (added),
// depth, minutes, spans (new), dur, pos, estimated, visit:true }.
export function recordProgress(itemId, delta) {
  return R.patchItem(itemId, (i) => {
    const p = i.progress || {};
    const now = Date.now();
    return {
      progress: {
        kind: delta.kind || p.kind,
        ms: (p.ms || 0) + (delta.ms || 0),
        ...(delta.kind === 'read' || p.kind === 'read'
          ? { depth: Math.max(p.depth || 0, delta.depth || 0), minutes: delta.minutes || p.minutes || null }
          : {
            spans: mergeSpans([...(p.spans || []), ...(delta.spans || [])]),
            dur: delta.dur || p.dur || null,
            pos: delta.pos ?? p.pos ?? null,
          }),
        estimated: delta.estimated ?? p.estimated ?? false,
        visits: (p.visits || 0) + (delta.visit ? 1 : 0),
        firstAt: p.firstAt || now,
        lastAt: now,
      },
    };
  });
}
