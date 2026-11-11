// Actions: the engine (src/engine) applied to the record (src/data/record.js).
// UI calls these; they persist every step immediately, so a reload or a second
// device never loses work. In-flight work (reading, filling slots, judging) is
// tracked in memory in `busy` — the UI subscribes to it via useBusy().

import * as R from './record.js';
import { readThread, analyzeImage, judgeMovement, effectHistory, applyCorrections, tasteProfile } from '../engine/thread.js';
import { fillSlot } from '../engine/feed.js';
import { tagItems, vocabulary } from '../engine/tags.js';
import { SLOTS } from '../engine/prompts.js';

// ---- busy state ------------------------------------------------------------
// busy[threadId] = { reading?:true, filling?:Set(slot), judging?:true, error?:string }
const busy = {};
const busyListeners = new Set();
let busyVersion = 0;
export const subscribeBusy = (fn) => { busyListeners.add(fn); return () => busyListeners.delete(fn); };
export const getBusyVersion = () => busyVersion;
export const getBusy = (threadId) => busy[threadId] || {};
export function setBusy(threadId, patch) {
  busy[threadId] = { ...(busy[threadId] || {}), ...patch };
  busyVersion++;
  for (const fn of busyListeners) fn();
}
// Dismiss the error shown for a thread.
export const clearError = (threadId) => setBusy(threadId, { error: null });
const errText = (e) => (e?.message || String(e)).slice(0, 240);

// ---- context for the engine ---------------------------------------------------
export function buildContext(threadId) {
  const t = R.getThread(threadId);
  if (!t) throw new Error('No such thread');
  const sessions = R.sessionsFor(threadId);
  const itemsById = Object.fromEntries(R.itemsFor(threadId).map((i) => [i.id, i]));
  const kept = Object.values(itemsById).filter((i) => i.kept).map((i) => ({
    title: i.title, slot: i.slot, note: (i.notes || []).map((n) => n.text).join(' / '),
  }));
  const parent = t.parentId ? R.getThread(t.parentId) : null;
  return {
    question: R.currentArticulation(t),
    reading: t.reading,
    corrections: t.corrections,
    history: effectHistory(sessions, itemsById),
    kept,
    artifact: t.image,
    seed: t.seed,
    lineage: parent ? { fromQuestion: R.currentArticulation(parent), anchorTitle: t.spawnAnchor?.title } : null,
    taste: R.getSettings().ratings ? tasteProfile(R.allItems()) : null,
    vocab: vocabulary(R.allItems()),
  };
}

// Every URL this thread has ever been shown — never show one twice.
const shownUrls = (threadId) => R.itemsFor(threadId).map((i) => i.url).filter(Boolean);

// ---- threads -----------------------------------------------------------------
// Create a thread, read it, and open its first session (feed fills in background).
// opts: { text, seed, image:{base64, mediaType, thumbnail, observation}, parentId, spawnAnchor }
export async function createThread({ text, seed = null, image = null, parentId = null, spawnAnchor = null }) {
  if (!text || !text.trim()) throw new Error('Write the question first.');
  const t = R.newThread({
    text, seed, parentId, spawnAnchor,
    image: image ? { observation: image.observation || '', thumbnail: image.thumbnail || null } : null,
  });
  if (parentId) R.touch(parentId);
  // Fire and forget: the page shows progress from busy state.
  (async () => {
    await reread(t.id, image);
    if (!R.getThread(t.id)?.reading) return;
    await newFeed(t.id);
  })();
  return t.id;
}

export async function reread(threadId, image = null) {
  setBusy(threadId, { reading: true, error: null });
  try {
    const reading = await readThread(buildContext(threadId), image && image.base64 ? image : null);
    R.patchThread(threadId, { reading, readAt: Date.now() });
  } catch (e) {
    setBusy(threadId, { error: `Couldn't read the thread: ${errText(e)}` });
  } finally {
    setBusy(threadId, { reading: false });
  }
}

// Corrections to the reading take effect immediately (in code) and shape
// every later reading, feed, and judgement.
export function rejectFromReading(threadId, field, text) {
  R.patchThread(threadId, (t) => {
    const corrections = {
      ...t.corrections,
      rejected: [...new Set([...(t.corrections?.rejected || []), text])],
      added: (t.corrections?.added || []).filter((a) => a.text !== text),
    };
    return { corrections, reading: applyCorrections(t.reading, corrections) };
  });
}
export function addToReading(threadId, field, text) {
  if (!text.trim()) return;
  R.patchThread(threadId, (t) => {
    const corrections = {
      ...t.corrections,
      added: [...(t.corrections?.added || []).filter((a) => a.text !== text.trim()), { field, text: text.trim() }],
      rejected: (t.corrections?.rejected || []).filter((r) => r !== text.trim()),
    };
    return { corrections, reading: applyCorrections(t.reading, corrections) };
  });
}
export function setReadingNote(threadId, note) {
  R.patchThread(threadId, (t) => ({ corrections: { ...t.corrections, note } }));
}
export function editReadingField(threadId, field, value) {
  R.patchThread(threadId, (t) => ({ reading: { ...t.reading, [field]: value } }));
}

export function closeThread(threadId, synthesis) {
  R.patchThread(threadId, { status: 'closed', synthesis: (synthesis || '').trim(), closedAt: Date.now(), touchedAt: Date.now() });
}
export function reopenThread(threadId) {
  R.patchThread(threadId, { status: 'active', closedAt: null, touchedAt: Date.now() });
}

// Start a new thread from a feed item ("Pursue this"). The user writes the question.
export function spawnFromItem(itemId, text) {
  const it = R.getItem(itemId);
  if (!it) throw new Error('No such item');
  return createThread({
    text, parentId: it.threadId,
    spawnAnchor: { itemId: it.id, title: it.title, url: it.url },
    seed: { title: it.title, source: it.source, url: it.url, why: it.why, excerpt: it.preview },
  });
}

// Start from an image: returns { observation, candidates } for the user to pick.
export const readImage = (image, note) => analyzeImage(image, note);

// ---- sessions and the feed -----------------------------------------------------
// Open a session (snapshotting the articulation) and fill its four slots.
export async function newFeed(threadId) {
  const t = R.getThread(threadId);
  if (!t) return;
  let s = R.openSessionFor(threadId);
  if (!s) {
    s = R.putSession({
      id: R.genId(), threadId, openedAt: Date.now(), closedAt: null,
      articulationAtOpen: R.currentArticulation(t), articulationAtClose: null, itemIds: [], diff: null, note: '',
    });
  }
  R.touch(threadId);
  await fillMissing(threadId);
}

// Fill whichever slots the open session doesn't have yet (also resumes a
// feed interrupted by a reload).
export async function fillMissing(threadId) {
  const s = R.openSessionFor(threadId);
  if (!s) return;
  const have = new Set(R.sessionItems(s).filter((i) => !i.failed).map((i) => i.slot));
  const todo = SLOTS.filter((slot) => !have.has(slot) && !getBusy(threadId).filling?.has(slot));
  if (!todo.length) return;
  if (!R.getThread(threadId).reading) await reread(threadId);
  const filling = new Set([...(getBusy(threadId).filling || []), ...todo]);
  setBusy(threadId, { filling, error: null });
  const save = (slot, got) => {
    const item = R.putItem({
      id: R.genId(), threadId, sessionId: s.id, ...got,
      signal: null, kept: false, openedAt: null, rating: null, notes: [], replacedBy: null, createdAt: Date.now(),
    });
    R.patchSession(s.id, (cur) => {
      // Replace any earlier item for the same slot (failed, or a duplicate being refilled), keep slot order.
      const ids = cur.itemIds.filter((id) => { const x = R.getItem(id); return !(x && x.slot === slot && (x.failed || x.duplicate)); });
      ids.push(item.id);
      ids.sort((a, b) => SLOTS.indexOf(R.getItem(a)?.slot) - SLOTS.indexOf(R.getItem(b)?.slot));
      return { itemIds: ids };
    });
    return item;
  };
  const done = (slot) => { filling.delete(slot); setBusy(threadId, { filling: new Set(filling) }); };
  try {
    // Slots fill in parallel: Groq takes what its rate limit allows, and a
    // rate-limited call falls back to Claude on a local server (proxyCore).
    const exclude = shownUrls(threadId);
    const results = await Promise.all(todo.map(async (slot) => {
      const got = await fillSlot(slot, buildContext(threadId), exclude);
      const item = save(slot, got);
      if (!got.url || !R.sessionItems(R.getSession(s.id)).some((o) => o.id !== item.id && o.url === got.url)) done(slot);
      return item;
    }));
    // Two parallel slots can land on the same URL: refill the later one, now excluding everything shown.
    const seen = new Set();
    for (const item of results) {
      if (!item.url || !seen.has(item.url)) { if (item.url) seen.add(item.url); continue; }
      R.patchItem(item.id, { duplicate: true });
      save(item.slot, await fillSlot(item.slot, buildContext(threadId), shownUrls(threadId)));
      done(item.slot);
    }
  } catch (e) {
    setBusy(threadId, { error: `Feed stopped: ${errText(e)}` });
  } finally {
    setBusy(threadId, { filling: new Set() });
  }
}

// "↻ Different item": a new item for the same slot; the old one is kept in
// the record (replacedBy) so signals and notes on it survive.
export async function replaceItem(itemId) {
  const old = R.getItem(itemId);
  if (!old) return;
  const { threadId, sessionId, slot } = old;
  const filling = new Set([...(getBusy(threadId).filling || []), slot]);
  setBusy(threadId, { filling, error: null });
  try {
    const got = await fillSlot(slot, buildContext(threadId), shownUrls(threadId));
    const item = R.putItem({
      id: R.genId(), threadId, sessionId, ...got,
      signal: null, kept: false, openedAt: null, rating: null, notes: [], replacedBy: null, createdAt: Date.now(),
    });
    R.patchItem(itemId, { replacedBy: item.id });
    R.patchSession(sessionId, (s) => ({ itemIds: s.itemIds.map((id) => (id === itemId ? item.id : id)) }));
  } catch (e) {
    setBusy(threadId, { error: `Couldn't find another item: ${errText(e)}` });
  } finally {
    const f = new Set(getBusy(threadId).filling || []); f.delete(slot);
    setBusy(threadId, { filling: f });
  }
}

// Restate the question. Inside an open session this closes the session and
// judges the movement against the articulation it opened with.
export async function restate(threadId, text, note = '') {
  text = (text || '').trim();
  if (!text) throw new Error('Write where the question is now.');
  const s = R.openSessionFor(threadId);
  if (!s) {
    R.patchThread(threadId, (t) => ({ articulations: [...t.articulations, { text, at: Date.now(), sessionId: null }], touchedAt: Date.now() }));
    return null;
  }
  setBusy(threadId, { judging: true, error: null });
  try {
    const items = R.sessionItems(s).filter((i) => !i.failed);
    const diff = await judgeMovement({
      before: s.articulationAtOpen, after: text, note,
      moved: items.filter((i) => i.signal === 'moved'),
      closed: items.filter((i) => i.signal === 'closed'),
      kept: items.filter((i) => i.kept),
    });
    R.patchSession(s.id, { closedAt: Date.now(), articulationAtClose: text, diff, note });
    R.patchThread(threadId, (t) => ({ articulations: [...t.articulations, { text, at: Date.now(), sessionId: s.id }], touchedAt: Date.now() }));
    return diff;
  } catch (e) {
    setBusy(threadId, { error: `Couldn't judge the movement: ${errText(e)} — your restatement is not lost; try again.` });
    throw e;
  } finally {
    setBusy(threadId, { judging: false });
  }
}

// End a session without restating (nothing moved enough to say).
export function endSessionQuietly(threadId) {
  const s = R.openSessionFor(threadId);
  if (s) R.patchSession(s.id, { closedAt: Date.now(), articulationAtClose: null, diff: null });
}

// ---- items -----------------------------------------------------------------------
export const setSignal = (itemId, signal) => {
  const it = R.patchItem(itemId, (i) => ({ signal: i.signal === signal ? null : signal }));
  if (it) R.touch(it.threadId);
};
export const toggleKeep = (itemId) => R.patchItem(itemId, (i) => ({ kept: !i.kept }));
export const markOpened = (itemId) => R.patchItem(itemId, (i) => ({ openedAt: i.openedAt || Date.now() }));
export const addNote = (itemId, text) => {
  if (!text.trim()) return;
  R.patchItem(itemId, (i) => ({ notes: [...(i.notes || []), { text: text.trim(), at: Date.now() }], kept: true }));
};
export const removeNote = (itemId, at) => R.patchItem(itemId, (i) => ({ notes: (i.notes || []).filter((n) => n.at !== at) }));
export const setRating = (itemId, axis, value) => R.patchItem(itemId, (i) => ({ rating: { ...(i.rating || {}), [axis]: value } }));

// ---- Promenade ---------------------------------------------------------------------
// "Hold this": a thread seeded by a shelf item; the user writes the question.
export const holdItem = (card, text) => createThread({
  text, seed: { title: card.title, source: card.source, url: card.url, why: card.why, excerpt: card.excerpt || '' },
});

// ---- tags ----------------------------------------------------------------------
// Items you've engaged with (opened, marked, kept, noted, rated) that have no
// field/topic tags yet get them, in batches. Returns how many were tagged.
// One run at a time; onProgress(done, total) for the Library's status line.
export const engaged = (i) => !i.failed && !i.duplicate && !!(i.openedAt || i.signal || i.kept || (i.notes || []).length
  || (i.rating && Object.values(i.rating).some((v) => v > 0)));
let tagging = null;
export function tagUntagged(onProgress = () => {}) {
  if (tagging) return tagging;
  tagging = (async () => {
    const todo = R.allItems().filter((i) => engaged(i) && !i.topics?.length && !i.tagFailed);
    let done = 0;
    for (let k = 0; k < todo.length; k += 15) {
      const batch = todo.slice(k, k + 15);
      onProgress(done, todo.length);
      try {
        const tags = await tagItems(batch, vocabulary(R.allItems()));
        batch.forEach((it, j) => {
          const t = tags[j];
          if (t.topics.length) R.patchItem(it.id, { field: t.field || it.field || null, topics: t.topics, mediaType: t.mediaType });
          else R.patchItem(it.id, { tagFailed: true });
        });
      } catch (e) {
        console.warn('[tags]', e.message);
        break;
      }
      done += batch.length;
    }
    onProgress(done, todo.length);
    return done;
  })().finally(() => { tagging = null; });
  return tagging;
}
