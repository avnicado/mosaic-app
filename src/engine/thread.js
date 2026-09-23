// Thread-level reasoning: reading a thread, starting from an image, judging
// movement, and distilling the effect history the next feed corrects against.
// Pure: takes plain data, returns plain data. The data layer (src/data) owns storage.

import { callLLMJSON, MODEL, VISION_MODEL } from './llm.js';
import { CHARACTERIZE_SYSTEM, ARTIFACT_CANDIDATES_PROMPT, characterizePrompt, diffPrompt, clip, SLOTS } from './prompts.js';

const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Apply the user's corrections in CODE, not only in the prompt: rejected
// items never come back, added ones are always present.
export function applyCorrections(reading, corrections) {
  if (!reading) return reading;
  const rejected = new Set((corrections?.rejected || []).map(norm));
  const added = corrections?.added || [];
  const keep = (xs) => xs.filter((x) => !rejected.has(norm(x)));
  const withAdded = (xs, field) => {
    const extra = added.filter((a) => (a.field || 'absent') === field).map((a) => a.text);
    const have = new Set(xs.map(norm));
    return [...xs, ...extra.filter((x) => !have.has(norm(x)))];
  };
  return {
    ...reading,
    presuppositions: withAdded(keep(arr(reading.presuppositions)), 'presuppositions'),
    absent: withAdded(keep(arr(reading.absent)), 'absent'),
  };
}

export function imageBlock(image) {
  return { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}` } };
}

// ctx: see prompts.contextBlock. image: optional {base64, mediaType}.
export async function readThread(ctx, image = null) {
  const text = characterizePrompt({
    ...ctx,
    corrections: ctx.corrections && {
      ...ctx.corrections,
      added: (ctx.corrections.added || []).map((a) => `${a.text} (${a.field === 'presuppositions' ? 'an assumption' : 'missing'})`),
    },
  });
  const messages = image ? [{ role: 'user', content: [imageBlock(image), { type: 'text', text }] }] : null;
  const r = await callLLMJSON({
    system: CHARACTERIZE_SYSTEM,
    prompt: text,
    messages,
    model: image ? VISION_MODEL : MODEL,
    maxTokens: 1200,
  });
  const reading = {
    domain: String(r.domain || '').trim(),
    questionType: String(r.questionType || '').trim(),
    mode: r.mode === 'explore' ? 'explore' : 'question',
    register: String(r.register || 'curious').trim(),
    presuppositions: arr(r.presuppositions),
    absent: arr(r.absent),
    openingMove: String(r.openingMove || '').trim(),
  };
  return applyCorrections(reading, ctx.corrections);
}

export async function analyzeImage(image, note = '') {
  const r = await callLLMJSON({
    system: ARTIFACT_CANDIDATES_PROMPT,
    messages: [{ role: 'user', content: [imageBlock(image), { type: 'text', text: note ? `What drew me to it: ${note}` : 'Here is the image.' }] }],
    model: VISION_MODEL,
    maxTokens: 1200,
  });
  const candidates = (r.candidates || []).filter((c) => c && c.question).slice(0, 3);
  if (!candidates.length) throw new Error('No candidate questions came back — try again.');
  return { observation: String(r.observation || ''), candidates };
}

// → { verdict: 'real'|'cosmetic', why, moves:[{label, content}] }
export async function judgeMovement({ before, after, moved = [], closed = [], kept = [], note = '' }) {
  const fmt = (it) => `"${clip(it.title, 90)}" (${it.slot})`;
  const r = await callLLMJSON({
    prompt: diffPrompt({ before, after, moved: moved.map(fmt), closed: closed.map(fmt), kept: kept.map(fmt), note }),
    maxTokens: 1500,
  });
  const moves = (Array.isArray(r.moves) ? r.moves : []).filter((m) => m && (m.label || m.content))
    .map((m) => ({ label: String(m.label || '').trim(), content: String(m.content || '').trim() }));
  return { verdict: r.verdict === 'cosmetic' ? 'cosmetic' : 'real', why: String(r.verdictWhy || '').trim(), moves };
}

// Effect history for one thread: the last few closed sessions (question
// before → after, verdict, moves, what moved / closed it), plus per-slot
// outcomes across ALL of the thread's sessions. sessions: oldest→newest.
// itemsById: { [id]: item }. Returns text or null.
export function effectHistory(sessions, itemsById) {
  const lines = [];
  const outcomes = Object.fromEntries(SLOTS.map((s) => [s, { moved: 0, closed: 0 }]));
  for (const s of sessions) {
    for (const id of s.itemIds || []) {
      const it = itemsById[id];
      if (!it || it.failed) continue;
      if (it.signal === 'moved') outcomes[it.slot] && outcomes[it.slot].moved++;
      if (it.signal === 'closed') outcomes[it.slot] && outcomes[it.slot].closed++;
    }
  }
  for (const s of sessions.filter((x) => x.closedAt).slice(-3)) {
    const items = (s.itemIds || []).map((id) => itemsById[id]).filter(Boolean);
    const moved = items.filter((i) => i.signal === 'moved').map((i) => `"${clip(i.title, 70)}" (${i.slot})`);
    const closed = items.filter((i) => i.signal === 'closed').map((i) => `"${clip(i.title, 70)}" (${i.slot})`);
    const moves = (s.diff?.moves || []).map((m) => m.label).filter(Boolean).join(', ');
    lines.push(`Session: "${clip(s.articulationAtOpen, 90)}" → "${clip(s.articulationAtClose, 90)}"${s.diff ? ` — ${s.diff.verdict}` : ''}${moves ? ` (${moves})` : ''}`);
    if (moved.length) lines.push(`  Moved them: ${moved.join('; ')}`);
    if (closed.length) lines.push(`  Closed it down: ${closed.join('; ')}`);
    if (s.note) lines.push(`  Their note: "${clip(s.note, 140)}"`);
  }
  const summary = SLOTS.filter((s) => outcomes[s].moved || outcomes[s].closed)
    .map((s) => `${s}: ${outcomes[s].moved} moved / ${outcomes[s].closed} closed`).join(' · ');
  if (!lines.length && !summary) return null;
  return lines.join('\n') + (summary ? `\nSlot outcomes so far — ${summary}` : '');
}

// The user's own quality ratings (Media Nudge axes, 0–4), distilled across
// EVERY rated item on every thread — taste is about the person, not one
// question. Returns null when there's too little to say.
const AXES = ['informative', 'artistic', 'profound', 'ethical', 'entertaining', 'provoking'];
export function tasteProfile(items) {
  const rated = items.filter((i) => i.rating && AXES.some((a) => (i.rating[a] || 0) > 0));
  if (!rated.length) return null;
  const mean = (i) => { const v = AXES.map((a) => i.rating[a] || 0).filter((x) => x > 0); return v.reduce((a, b) => a + b, 0) / v.length; };
  const fmt = (i) => `"${clip(i.title, 80)}" (${i.slot}, ${i.mediaType || 'item'}${i.source ? `, ${clip(i.source, 40)}` : ''}) — ${AXES.filter((a) => i.rating[a] > 0).map((a) => `${a} ${i.rating[a]}`).join(', ')}`;
  const sorted = rated.slice().sort((a, b) => mean(b) - mean(a));
  const high = sorted.filter((i) => mean(i) >= 3).slice(0, 5).map(fmt);
  const low = sorted.filter((i) => mean(i) <= 1.5).reverse().slice(0, 5).map(fmt);
  const avg = AXES.map((a) => {
    const v = rated.map((i) => i.rating[a] || 0).filter((x) => x > 0);
    return v.length ? [a, v.reduce((x, y) => x + y, 0) / v.length, v.length] : null;
  }).filter(Boolean);
  const axes = avg.map(([a, m, n]) => `${a} ${m.toFixed(1)}/4 (${n})`).join(' · ');
  return { count: rated.length, high, low, axes };
}
