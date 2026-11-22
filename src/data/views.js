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
