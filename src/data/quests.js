// Quest actions: the guide (src/engine/quest.js) applied to the record.
// Every step persists immediately. In-flight work shows through the shared
// busy state (actions.js), keyed by the quest id: { thinking, finding, error }.

import * as R from './record.js';
import { setBusy, getBusy, createThread } from './actions.js';
import { engaged } from './actions.js';
import { guideTurn, findWorks, REACTIONS } from '../engine/quest.js';
import { vocabulary } from '../engine/tags.js';
import { progressText } from './progress.js';

const errText = (e) => (e?.message || String(e)).slice(0, 240);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const msg = (role, text, extra = {}) => ({ id: R.genId(), role, text, at: Date.now(), ...extra });
const firstWords = (s, n = 6) => {
  const w = String(s).replace(/^(teach me( about)?|tell me about|i want to learn( about)?|help me (learn|understand))\s+/i, '').split(/\s+/).slice(0, n).join(' ');
  return w.charAt(0).toUpperCase() + w.slice(1).replace(/[?.!]+$/, '');
};

export const EMPTY_LEARNER = { level: '', background: '', known: [], interests: [], avoid: [], prefers: [] };
const LIST_FIELDS = ['known', 'interests', 'avoid', 'prefers'];

// ---- context for the guide -------------------------------------------------------
function questContext(q) {
  const items = R.questItems(q.id).filter((i) => !i.failed);
  const branchTitle = Object.fromEntries((q.map || []).map((b) => [b.id, b.title]));
  const all = R.allItems();
  return {
    title: q.title,
    learner: q.learner,
    map: q.map,
    transcript: q.messages,
    items: items.map((i) => ({
      title: i.title, source: i.source, level: i.level, reaction: i.reaction,
      opened: !!i.openedAt, progress: progressText(i.progress), branch: branchTitle[i.branchId],
    })),
    readElsewhere: all.filter((i) => i.questId !== q.id && engaged(i)).map((i) => i.title),
    vocab: vocabulary(all),
  };
}

// Never point to the same thing twice, and never to something already opened anywhere.
const excludeFor = (q) => [...new Set([
  ...R.questItems(q.id).map((i) => i.url),
  ...R.allItems().filter((i) => i.openedAt || i.progress).map((i) => i.url),
].filter(Boolean))];

// ---- quests ------------------------------------------------------------------------
export function startQuest(text) {
  text = (text || '').trim();
  if (!text) throw new Error('Say what you want to learn about.');
  const now = Date.now();
  const q = R.putQuest({
    id: R.genId(), title: firstWords(text), titled: false, learner: { ...EMPTY_LEARNER }, map: [],
    messages: [msg('you', text)], status: 'active', createdAt: now, touchedAt: now,
  });
  runTurn(q.id, text);
  return q.id;
}

export function say(questId, text) {
  text = (text || '').trim();
  if (!text || getBusy(questId).thinking) return;
  R.patchQuest(questId, (q) => ({ messages: [...q.messages, msg('you', text)], touchedAt: Date.now() }));
  runTurn(questId, text);
}

// Try the last turn again after an error.
export function retry(questId) {
  const q = R.getQuest(questId);
  const last = [...(q?.messages || [])].reverse().find((m) => m.role === 'you');
  if (last) runTurn(questId, last.text);
}

async function runTurn(questId, text) {
  setBusy(questId, { thinking: true, error: null });
  let turn;
  try {
    const q = R.getQuest(questId);
    // The prompt adds this message itself as the newest LEARNER line.
    const ctx = questContext({ ...q, messages: q.messages.slice(0, -1) });
    turn = await guideTurn(ctx, text);
  } catch (e) {
    setBusy(questId, { thinking: false, error: `The guide couldn't answer: ${errText(e)}` });
    return;
  }
  const guideMsg = msg('guide', turn.reply, { question: turn.question || null, find: turn.find ? { what: turn.find.what, level: turn.find.level } : null, itemIds: [] });
  let branchId = null;
  R.patchQuest(questId, (q) => {
    const learner = mergeLearner(q.learner, turn.learner);
    const map = [...(q.map || [])];
    const have = new Set(map.map((b) => norm(b.title)));
    for (const b of turn.map.add) {
      if (have.has(norm(b.title))) continue;
      have.add(norm(b.title));
      map.push({ id: R.genId(), title: b.title, why: b.why, status: 'open', threadId: null, at: Date.now() });
    }
    const focus = norm(turn.map.focus || turn.find?.region);
    const fb = focus && map.find((b) => norm(b.title) === focus);
    if (fb) { branchId = fb.id; if (fb.status === 'open') fb.status = 'exploring'; }
    return {
      title: !q.titled && turn.title ? turn.title : q.title, titled: q.titled || !!turn.title,
      learner, map, messages: [...q.messages, guideMsg], touchedAt: Date.now(),
    };
  });
  setBusy(questId, { thinking: false });
  if (turn.find) await find(questId, guideMsg.id, turn.find, branchId);
}

async function find(questId, messageId, need, branchId) {
  setBusy(questId, { finding: true, error: null });
  try {
    const q = R.getQuest(questId);
    const works = await findWorks(questContext(q), need, excludeFor(q));
    const ids = works.map((w) => R.putItem({
      id: R.genId(), questId, branchId, threadId: null, sessionId: null, slot: null, ...w,
      signal: null, kept: false, openedAt: null, rating: null, notes: [], replacedBy: null, reaction: null, createdAt: Date.now(),
    }).id);
    R.patchQuest(questId, (cur) => ({
      messages: cur.messages.map((m) => (m.id === messageId ? { ...m, itemIds: ids, findEmpty: !ids.length } : m)),
    }));
  } catch (e) {
    setBusy(questId, { error: `The search didn't work: ${errText(e)}` });
    R.patchQuest(questId, (cur) => ({ messages: cur.messages.map((m) => (m.id === messageId ? { ...m, findFailed: true } : m)) }));
  } finally {
    setBusy(questId, { finding: false });
  }
}

// Search again for the find a guide message asked for.
export function findAgain(questId, messageId) {
  const q = R.getQuest(questId);
  const m = q?.messages.find((x) => x.id === messageId);
  if (!m?.find || getBusy(questId).finding) return;
  R.patchQuest(questId, (cur) => ({ messages: cur.messages.map((x) => (x.id === messageId ? { ...x, findFailed: false, findEmpty: false } : x)) }));
  find(questId, messageId, { ...m.find, count: Math.max(1, (m.itemIds || []).length || 2) }, null);
}

function mergeLearner(cur = EMPTY_LEARNER, upd = {}) {
  const out = { ...EMPTY_LEARNER, ...cur };
  if (upd.level) out.level = upd.level;
  if (upd.background) out.background = upd.background;
  for (const f of LIST_FIELDS) {
    const have = new Set((out[f] || []).map(norm));
    out[f] = [...(out[f] || []), ...(upd[f] || []).filter((x) => !have.has(norm(x)))].slice(-24);
  }
  return out;
}

// ---- reactions --------------------------------------------------------------------
// How an item landed. Recorded on the item and told to the guide in the conversation.
export function react(itemId, reaction) {
  const it = R.getItem(itemId);
  if (!it?.questId) return;
  const next = it.reaction === reaction ? null : reaction;
  R.patchItem(itemId, { reaction: next, reactedAt: Date.now() });
  if (!next) return;
  const label = REACTIONS.find((r) => r.key === next)?.label.toLowerCase() || next;
  R.patchQuest(it.questId, (q) => ({ messages: [...q.messages, msg('event', `“${it.title}”: ${label}.`, { itemId })], touchedAt: Date.now() }));
}

// ---- what the guide knows (yours to correct) -----------------------------------------
export function setLearnerField(questId, field, value) {
  R.patchQuest(questId, (q) => ({ learner: { ...EMPTY_LEARNER, ...q.learner, [field]: String(value || '').trim() } }));
}
export function addLearner(questId, field, text) {
  if (!text.trim() || !LIST_FIELDS.includes(field)) return;
  R.patchQuest(questId, (q) => ({ learner: mergeLearner(q.learner, { [field]: [text.trim()] }) }));
}
export function removeLearner(questId, field, text) {
  R.patchQuest(questId, (q) => ({ learner: { ...q.learner, [field]: (q.learner?.[field] || []).filter((x) => x !== text) } }));
}

// ---- the map -----------------------------------------------------------------------
export function setBranchStatus(questId, branchId, status) {
  R.patchQuest(questId, (q) => ({ map: q.map.map((b) => (b.id === branchId ? { ...b, status } : b)) }));
}
export function addBranch(questId, title) {
  if (!title.trim()) return;
  R.patchQuest(questId, (q) => ({ map: [...q.map, { id: R.genId(), title: title.trim(), why: '', status: 'open', threadId: null, at: Date.now() }] }));
}
export function exploreBranch(questId, branchId) {
  const b = R.getQuest(questId)?.map.find((x) => x.id === branchId);
  if (b) say(questId, `Let's go into “${b.title}”.`);
}

// A question that surfaced on the quest becomes its own thread (the four-item
// loop, with restatement and movement). The thread remembers its quest.
export async function holdAsThread(questId, text, branchId = null) {
  const id = await createThread({ text });
  R.patchThread(id, { questId });
  R.patchQuest(questId, (q) => ({
    map: q.map.map((b) => (b.id === branchId ? { ...b, threadId: id, status: b.status === 'open' ? 'exploring' : b.status } : b)),
    messages: [...q.messages, msg('event', `Held as a thread: “${text.trim()}”.`, { threadId: id })],
    touchedAt: Date.now(),
  }));
  return id;
}

export const closeQuest = (questId) => R.patchQuest(questId, { status: 'closed', touchedAt: Date.now() });
export const reopenQuest = (questId) => R.patchQuest(questId, { status: 'active', touchedAt: Date.now() });
export const renameQuest = (questId, title) => title.trim() && R.patchQuest(questId, { title: title.trim(), titled: true });
