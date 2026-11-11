// Alpha feedback. Anyone signed in can send a note; only the owner (the admin)
// can read, mark or delete them. Notes live in one hash, m2:feedback, apart
// from every person's record: sending feedback never touches a record, and
// removing a member (server/users.js) leaves their notes for the admin.

import crypto from 'node:crypto';
import { hashGetAll, hashUpdate } from './store.js';

const FEEDBACK = 'm2:feedback';
export const KINDS = ['bug', 'idea', 'confusing', 'other'];
export const MAX_MESSAGE = 4000;
export const DAY_LIMIT = 20; // per person, per 24 hours
const DAY_MS = 24 * 3600 * 1000;

const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };

// Newest first.
export async function listFeedback() {
  const raw = await hashGetAll(FEEDBACK);
  return Object.values(raw).map(parse).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

// → the stored note. Throws a {status} error for bad input or too many notes.
export async function addFeedback(user, { message, kind, page, device }) {
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text) throw Object.assign(new Error('Write something first.'), { status: 400 });
  if (text.length > MAX_MESSAGE) throw Object.assign(new Error(`Keep it under ${MAX_MESSAGE} characters.`), { status: 413 });
  const since = Date.now() - DAY_MS;
  const recent = (await listFeedback()).filter((f) => f.userId === user.id && f.createdAt > since).length;
  if (recent >= DAY_LIMIT) throw Object.assign(new Error('That is a lot of notes for one day. Try again tomorrow.'), { status: 429 });
  const note = {
    id: Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    userId: user.id,
    userName: user.name,
    kind: KINDS.includes(kind) ? kind : 'other',
    message: text,
    page: typeof page === 'string' && /^[a-z-]{1,24}$/.test(page) ? page : '',
    device: typeof device === 'string' ? device.slice(0, 160) : '',
    createdAt: Date.now(),
    read: false,
  };
  await hashUpdate(FEEDBACK, { set: { [note.id]: JSON.stringify(note) } });
  return note;
}

export async function markFeedback(id, read) {
  const all = await hashGetAll(FEEDBACK);
  const note = all[id] && parse(all[id]);
  if (!note) throw Object.assign(new Error('No such note.'), { status: 404 });
  await hashUpdate(FEEDBACK, { set: { [id]: JSON.stringify({ ...note, read: !!read }) } });
}

export const deleteFeedback = (id) => hashUpdate(FEEDBACK, { del: [String(id)] });
