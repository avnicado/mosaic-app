// How much of an item you actually read, watched or listened to, recorded by
// the reader (src/ui/reader/useProgress.js) on the item as `progress`:
//
//   progress { kind:'read'|'watch'|'listen',
//              ms,          active time: reading with the tab in view and not idle,
//                           or the player playing
//              depth,       articles: how far down the article you got (0–1)
//              minutes,     articles: the article's estimated reading time
//              expectSec,   articles: the same in seconds, set by how dense the text is
//              density,     articles: 'light'|'moderate'|'dense'|'very dense' (server/reader.js)
//              provider,    players: 'youtube'|'vimeo'|'spotify'|… (src/embed.js)
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

// Finished enough to count as done.
export const DONE_MEDIA = 0.85;    // of the length played: credits, outros and end ads sit in the last 15%
export const DONE_DEPTH = 0.8;     // of the article scrolled: extracted text often ends in references or comments
export const DONE_TIME = 0.4;      // of the expected reading time: faster than that is skimming
export const SPOTIFY_PREVIEW = 31; // s — a signed-out Spotify embed plays a 30 s preview and calls it the whole track

// How finished an item is: { level: 0–1, done } — level 1 is done. Null
// when Mosaic can't know (never opened in the reader, or a player that
// reports nothing).
// Articles: the weaker of how far you got (against DONE_DEPTH) and how long
// you spent (against DONE_TIME of the density-set expected time), so a quick
// scroll to the bottom isn't reading.
// Players: the share that actually played, against DONE_MEDIA.
export function completion(p) {
  if (!p || p.estimated) return null;
  let level;
  if (p.kind === 'read') {
    const expect = p.expectSec || (p.minutes ? p.minutes * 60 : null);
    if (p.depth == null || !expect) return null;
    level = Math.min(p.depth / DONE_DEPTH, p.ms / 1000 / (expect * DONE_TIME));
  } else {
    if (!p.dur) return null;
    level = covered(p.spans) / p.dur / DONE_MEDIA;
    if (p.provider === 'spotify' && p.dur <= SPOTIFY_PREVIEW) level = Math.min(level, 0.25);
  }
  level = Math.max(0, Math.min(1, level));
  return { level, done: level >= 0.999 };
}

const VERB = { read: 'read', watch: 'watched', listen: 'listened to' };
export function minutesText(ms) {
  const m = Math.round(ms / 60000);
  if (ms < 45000) return 'under 1 min';
  if (m < 60) return `${Math.max(1, m)} min`;
  return `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
}

// "read it · 9 min of ~12 min", "read 80% · 6 min of ~12 min", "watched 42% · 12 min", "about 9 min with the player".
export function progressText(p) {
  if (!p || (!p.ms && !covered(p.spans) && !p.depth)) return '';
  const done = doneOf(p);
  if (p.estimated) return `about ${minutesText(p.ms)} with the player`;
  const c = completion(p);
  // An article you got further down than your time there allows was skimmed.
  const expect = p.expectSec || (p.minutes ? p.minutes * 60 : null);
  const skimmed = p.kind === 'read' && !c?.done && expect && p.ms / 1000 / (expect * DONE_TIME) < Math.min(1, (p.depth || 0) / DONE_DEPTH);
  const pct = c?.done ? `${VERB[p.kind]} it`
    : skimmed ? (p.depth >= DONE_DEPTH ? 'skimmed to the end' : `skimmed ${Math.round(p.depth * 100)}%`)
      : done == null ? '' : `${VERB[p.kind]} ${Math.round(done * 100)}%`;
  const time = p.kind === 'read' && p.minutes ? `${minutesText(p.ms)} of ~${p.minutes} min` : minutesText(p.ms);
  const preview = p.provider === 'spotify' && p.dur && p.dur <= SPOTIFY_PREVIEW ? 'preview only' : null;
  return [pct || VERB[p.kind], time, preview].filter(Boolean).join(' · ');
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
          ? {
            depth: Math.max(p.depth || 0, delta.depth || 0), minutes: delta.minutes || p.minutes || null,
            expectSec: delta.expectSec || p.expectSec || null, density: delta.density || p.density || null,
          }
          : {
            spans: mergeSpans([...(p.spans || []), ...(delta.spans || [])]),
            dur: delta.dur || p.dur || null,
            pos: delta.pos ?? p.pos ?? null,
            provider: delta.provider || p.provider || null,
          }),
        estimated: delta.estimated ?? p.estimated ?? false,
        visits: (p.visits || 0) + (delta.visit ? 1 : 0),
        firstAt: p.firstAt || now,
        lastAt: now,
      },
    };
  });
}
