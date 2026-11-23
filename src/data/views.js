// The views mandala on a thread (admin only for now). The map is kept on the
// thread as `views`, tied to the wording it was made for: restating the
// question makes it stale. It is not part of a shared thread's snapshot
// (data/sharing.js picks its fields by name).
//
// The automatic check runs only for a wording written after the feature
// shipped (VIEWS_SINCE), once per wording, and only after the reading and the
// feed are done, so it never competes with them for the Groq budget. Older
// threads get the manual "Show the views" button.

import * as R from './record.js';
import { getBusy, setBusy } from './actions.js';
import { apiFetch } from '../engine/llm.js';
import { exampleFor, EXAMPLES } from '../viewsdemo/examples.js';
import { isJunkResult, verifyUrl } from '../engine/feed.js';
import { mediaInfo } from '../media.js';

export const VIEWS_SINCE = Date.parse('2026-11-22T00:00:00Z');

const lastWording = (t) => t?.articulations?.[t.articulations.length - 1];

// The map for the thread's current wording, if there is one.
export function currentViews(thread) {
  const v = thread?.views;
  return v && v.text === R.currentArticulation(thread) ? v : null;
}

export function wantsAutoCheck(thread) {
  if (!thread || thread.status === 'closed') return false;
  const w = lastWording(thread);
  return !!(w && (w.at || 0) >= VIEWS_SINCE && !currentViews(thread));
}

export async function requestViews(threadId, { force = false } = {}) {
  const t = R.getThread(threadId);
  if (!t || getBusy(threadId).views) return;
  const text = R.currentArticulation(t);
  setBusy(threadId, { views: force ? 'map' : 'check' });
  try {
    const res = await apiFetch('/api/views', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text, presuppositions: t.reading?.presuppositions || [], force }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Views error (${res.status})`);
    const { question, cached, ...map } = data;
    R.patchThread(threadId, { views: { ...map, text, force, open: map.status === 'divisive' } });
  } catch (e) {
    R.patchThread(threadId, { views: { text, force, error: (e?.message || String(e)).slice(0, 200), at: Date.now() } });
  } finally {
    setBusy(threadId, { views: null });
  }
}

export const setViewsOpen = (threadId, open) =>
  R.patchThread(threadId, (t) => (t.views ? { views: { ...t.views, open } } : {}));

// ---- the new views (Nov 2026): the views page's map, shown on the thread ----
// Kept on the thread as `viewsMap`, tied to the wording it was made for, like
// `views` above. A ready example (src/viewsdemo/examples.js) is shown at once
// and only its id is stored; any other question is mapped by /api/views-demo
// (server/viewsDemo.js), which maps any question people hold public views on,
// a scientific one included, and says 'none' only when there are no sides.

export function currentViewsMap(thread) {
  const text = R.currentArticulation(thread);
  const v = thread?.viewsMap;
  const ex = exampleFor(text);
  if (ex) return { text, status: 'mapped', map: ex, open: v?.text === text ? v.open : undefined };
  if (!v || v.text !== text) return null;
  if (v.exampleId) return { ...v, map: EXAMPLES.find((e) => e.id === v.exampleId) || null };
  return v;
}

export function wantsViewsMap(thread) {
  if (!thread || thread.status === 'closed') return false;
  const w = lastWording(thread);
  return !!(w && (w.at || 0) >= VIEWS_SINCE && !currentViewsMap(thread));
}

export async function requestViewsMap(threadId) {
  const t = R.getThread(threadId);
  if (!t || getBusy(threadId).viewsMap) return;
  const text = R.currentArticulation(t);
  setBusy(threadId, { viewsMap: true });
  try {
    const res = await apiFetch('/api/views-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Views error (${res.status})`);
    const { cached, ...map } = data;
    R.patchThread(threadId, { viewsMap: { text, status: map.status, map, open: map.status === 'mapped', at: Date.now() } });
  } catch (e) {
    R.patchThread(threadId, { viewsMap: { text, error: (e?.message || String(e)).slice(0, 200), at: Date.now() } });
  } finally {
    setBusy(threadId, { viewsMap: null });
  }
}

export const setViewsMapOpen = (threadId, open) =>
  R.patchThread(threadId, (t) => ({ viewsMap: { ...(t.viewsMap?.text === R.currentArticulation(t) ? t.viewsMap : { text: R.currentArticulation(t) }), open } }));

// ---- items on one ring's question ----
// A ring with fewer than two checked articles gets items about its question
// when it's tapped: a web search for the question, listings and junk dropped,
// at most one per site, every link opened. Kept on the thread as
// `viewsRingItems`, tied to the wording, so each ring is looked up once.
const ringInFlight = new Set();

export function ringItemsFor(thread, k) {
  const r = thread?.viewsRingItems;
  return r && r.text === R.currentArticulation(thread) ? (r.rings?.[k] || null) : null;
}

function saveRing(threadId, text, k, entry) {
  R.patchThread(threadId, (t) => {
    const cur = t.viewsRingItems?.text === text ? t.viewsRingItems : { text, rings: {} };
    return { viewsRingItems: { text, rings: { ...cur.rings, [k]: entry } } };
  });
}

export async function requestRingItems(threadId, k, { retry = false } = {}) {
  const t = R.getThread(threadId);
  const v = t && currentViewsMap(t);
  const c = v?.map?.cruxes?.[k];
  if (!c) return;
  const text = R.currentArticulation(t);
  const key = `${threadId}#${text}#${k}`;
  const have = ringItemsFor(t, k);
  if (ringInFlight.has(key) || (have && !have.loading && !retry)) return;
  ringInFlight.add(key);
  saveRing(threadId, text, k, { loading: true, at: Date.now() });
  try {
    const res = await apiFetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `${c.question} ${v.map.question}`.slice(0, 380), maxResults: 10 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Search error (${res.status})`);
    const taken = new Set((c.reading || []).map((s) => s.url));
    const hosts = new Set();
    const picks = [];
    for (const r of data.results || []) {
      const host = hostOf(r.url);
      if (!host || taken.has(r.url) || hosts.has(host) || isJunkResult(r)) continue;
      hosts.add(host);
      picks.push(r);
      if (picks.length >= 6) break;
    }
    const alive = await Promise.all(picks.map((r) => verifyUrl(r.url)));
    const items = picks.filter((_, i) => alive[i] !== 'dead').slice(0, 4).map((r) => {
      const m = mediaInfo('', r.url);
      return {
        title: String(r.title || '').slice(0, 200), url: r.url, outlet: hostOf(r.url),
        type: m.type, label: m.label, snippet: snippetOf(r.snippet),
      };
    });
    saveRing(threadId, text, k, { items, at: Date.now() });
  } catch (e) {
    saveRing(threadId, text, k, { items: [], error: (e?.message || String(e)).slice(0, 200), at: Date.now() });
  } finally {
    ringInFlight.delete(key);
  }
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
// The search's own excerpt, cut at a sentence end where it can be: a hint of
// what the page says, never presented as a quote.
function snippetOf(s) {
  const t = String(s || '').replace(/\s+/g, ' ').replace(/^[#*\-\s|]+/, '').trim();
  if (t.length < 40) return '';
  if (t.length <= 170) return t;
  const cut = t.slice(0, 170);
  const end = cut.lastIndexOf('. ');
  return end > 80 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}
