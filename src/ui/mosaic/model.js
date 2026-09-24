// The reading mosaic's model: what you've read and seen, as pieces grouped
// into fields, plus the numbers that say how much of it overlaps and whether
// you're spreading out. Pure reads over the record; no React, no writes.
import { mediaInfo, normalizeField, FIELDS } from '../../media.js';
import { engaged } from '../../data/actions.js';

const DAY = 864e5;
export const UNSORTED = 'unsorted';

// What happened between you and the item, strongest first. It sets the size
// and depth of the piece: an item that moved you is laid large and dark; one
// you only opened is small and pale; one that closed the question down is cut
// but left uncoloured.
export const KINDS = {
  moved:  { r: 25, t: 0.95, label: 'moved you (✦)' },
  kept:   { r: 19, t: 0.6,  label: 'kept or noted' },
  read:   { r: 14, t: 0.28, label: 'opened, rated or marked neutral' },
  closed: { r: 14, t: null, label: 'closed the question down' },
};
const kindOf = (i) => (i.signal === 'moved' ? 'moved'
  : i.signal === 'closed' ? 'closed'
  : i.kept || (i.notes || []).length ? 'kept' : 'read');

// A field's hue is fixed by its place in the list, spread by the golden angle
// so neighbouring fields never share a colour.
export const fieldHue = (f) => {
  const k = FIELDS.indexOf(f);
  return k < 0 ? 38 : (20 + k * 137.508) % 360;
};

export const topicSlug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_');

export function piecesFrom(items, threads) {
  const threadById = Object.fromEntries(threads.map((t) => [t.id, t]));
  return items.filter(engaged).map((i) => {
    const m = mediaInfo(i.mediaType, i.url);
    const t = threadById[i.threadId];
    const field = normalizeField(i.field) || normalizeField(t?.reading?.domain) || UNSORTED;
    return {
      id: i.id, title: i.title, source: i.source, url: i.url, slot: i.slot,
      threadId: i.threadId, mediaType: m.type, family: m.family,
      field, topics: i.topics || [], tagged: !!(i.topics || []).length,
      kind: kindOf(i), ts: i.openedAt || i.createdAt || 0,
    };
  }).sort((a, b) => a.ts - b.ts);
}

// Pieces → fields (panels) and the topics fields share (links).
export function fieldsFrom(pieces) {
  const byField = new Map();
  for (const p of pieces) {
    if (!byField.has(p.field)) byField.set(p.field, []);
    byField.get(p.field).push(p);
  }
  const fields = [...byField.entries()].map(([name, ps]) => {
    const topicCount = new Map();
    for (const p of ps) for (const t of p.topics) topicCount.set(t, (topicCount.get(t) || 0) + 1);
    return { name, pieces: ps, topicCount, hue: fieldHue(name) };
  }).sort((a, b) => b.pieces.length - a.pieces.length || a.name.localeCompare(b.name));

  const links = [];
  for (let a = 0; a < fields.length; a++) {
    for (let b = a + 1; b < fields.length; b++) {
      const A = fields[a], B = fields[b];
      if (A.name === UNSORTED || B.name === UNSORTED) continue;
      const shared = [...A.topicCount.keys()].filter((t) => B.topicCount.has(t))
        .map((t) => ({ topic: t, n: Math.min(A.topicCount.get(t), B.topicCount.get(t)) }))
        .sort((x, y) => y.n - x.n);
      if (shared.length) links.push({ a, b, shared, strength: shared.reduce((s, x) => s + x.n, 0) });
    }
  }
  return { fields, links: links.sort((x, y) => y.strength - x.strength) };
}

// exp(Shannon entropy): "how many fields' worth" — 1 when everything is in one
// field, N when it is spread evenly over N.
function effective(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return Math.exp(-counts.reduce((h, c) => (c ? h + (c / total) * Math.log(c / total) : h), 0));
}
const countBy = (list, key) => {
  const m = new Map();
  for (const x of list) { const k = key(x); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};

// Overlap and spread. `familiar` for an item = the share of its topics you'd
// already met in something earlier.
export function spreadStats(pieces, threads, now = Date.now()) {
  const tagged = pieces.filter((p) => p.tagged);
  const seen = new Set();
  const novelty = tagged.map((p) => {
    const fresh = p.topics.filter((t) => !seen.has(t));
    p.topics.forEach((t) => seen.add(t));
    return { p, fresh: fresh.length, familiar: 1 - fresh.length / p.topics.length };
  });
  const cut = now - 30 * DAY;
  const recent = novelty.filter((x) => x.p.ts >= cut);
  const earlier = novelty.filter((x) => x.p.ts < cut);
  const mean = (xs, f) => (xs.length ? xs.reduce((s, x) => s + f(x), 0) / xs.length : null);
  const fieldsOf = (xs) => [...countBy(xs.map((x) => x.p), (p) => p.field).values()];

  const stats = {
    items: pieces.length,
    tagged: tagged.length,
    topics: seen.size,
    fields: new Set(tagged.map((p) => p.field).filter((f) => f !== UNSORTED)).size,
    breadth: effective(fieldsOf(novelty)),
    overlap: mean(novelty.slice(1), (x) => x.familiar),
    recent: { n: recent.length, overlap: mean(recent, (x) => x.familiar), breadth: effective(fieldsOf(recent)) },
    earlier: { n: earlier.length, overlap: mean(earlier.slice(1), (x) => x.familiar), breadth: effective(fieldsOf(earlier)) },
  };

  // Where you are heading. Needs some history either side of the cut.
  if (recent.length < 3 || earlier.length < 5) stats.trend = 'early';
  else {
    const wider = stats.recent.breadth - stats.earlier.breadth;
    const newer = (1 - stats.recent.overlap) - (1 - (stats.earlier.overlap ?? stats.recent.overlap));
    stats.trend = wider > 0.6 || newer > 0.15 ? 'spreading'
      : wider < -0.6 || newer < -0.15 ? 'narrowing' : 'steady';
  }

  // New vs familiar topics per week, last 12 weeks.
  const weekStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const last = weekStart(now);
  stats.weeks = Array.from({ length: 12 }, (_, k) => ({ start: last - (11 - k) * 7 * DAY, fresh: 0, familiar: 0, items: 0 }));
  for (const x of novelty) {
    const w = stats.weeks.find((wk) => Math.abs(wk.start - weekStart(x.p.ts)) < DAY);
    if (!w) continue;
    w.items++; w.fresh += x.fresh; w.familiar += x.p.topics.length - x.fresh;
  }

  // Topics that cross fields, and topics that cross threads.
  const topicFields = new Map();
  const topicThreads = new Map();
  const topicCount = new Map();
  for (const p of tagged) {
    for (const t of p.topics) {
      if (!topicFields.has(t)) { topicFields.set(t, new Set()); topicThreads.set(t, new Set()); }
      if (p.field !== UNSORTED) topicFields.get(t).add(p.field);
      topicThreads.get(t).add(p.threadId);
      topicCount.set(t, (topicCount.get(t) || 0) + 1);
    }
  }
  const threadIds = new Set(threads.map((t) => t.id));
  stats.bridges = [...topicFields.entries()].filter(([, fs]) => fs.size > 1)
    .map(([topic, fs]) => ({ topic, fields: [...fs], n: topicCount.get(topic) }))
    .sort((a, b) => b.fields.length - a.fields.length || b.n - a.n).slice(0, 8);
  stats.crossThread = [...topicThreads.entries()]
    .map(([topic, ts]) => ({ topic, threads: [...ts].filter((id) => threadIds.has(id)), n: topicCount.get(topic) }))
    .filter((x) => x.threads.length > 1)
    .sort((a, b) => b.threads.length - a.threads.length || b.n - a.n).slice(0, 8);
  stats.topTopics = [...topicCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([topic, n]) => ({ topic, n }));

  // Threads whose reading overlaps: the share of each pair's topics in common.
  const threadTopics = new Map();
  for (const p of tagged) {
    if (!threadTopics.has(p.threadId)) threadTopics.set(p.threadId, new Set());
    p.topics.forEach((t) => threadTopics.get(p.threadId).add(t));
  }
  const tids = [...threadTopics.keys()].filter((id) => threadIds.has(id));
  const pairs = [];
  for (let a = 0; a < tids.length; a++) {
    for (let b = a + 1; b < tids.length; b++) {
      const A = threadTopics.get(tids[a]), B = threadTopics.get(tids[b]);
      const inter = [...A].filter((t) => B.has(t));
      if (!inter.length) continue;
      pairs.push({ a: tids[a], b: tids[b], shared: inter, jaccard: inter.length / new Set([...A, ...B]).size });
    }
  }
  stats.threadPairs = pairs.sort((x, y) => y.jaccard - x.jaccard).slice(0, 5);

  stats.media = [...countBy(pieces, (p) => p.mediaType).entries()].sort((a, b) => b[1] - a[1]);
  stats.families = Object.fromEntries(countBy(pieces, (p) => p.family));
  return stats;
}
