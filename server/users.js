// Accounts for a small group (the owner + a few invited people).
//
// The OWNER is not stored: it's defined by env — APP_PASSWORD (and optional
// OWNER_NAME, default "owner") — so a deployment can never lock its owner out.
// Everyone else joins through a one-time invite the owner creates, and gets a
// private record of their own (server/store.js → recordHash).

import crypto from 'node:crypto';
import { hashGetAll, hashGet, hashUpdate, hashDrop, recordHash } from './store.js';

const USERS = 'm2:users';
const INVITES = 'm2:invites';
const SHARED = 'm2:shared';
export const MAX_MEMBERS = Number(process.env.MAX_USERS || 5); // besides the owner
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

export const ownerName = () => (process.env.OWNER_NAME || 'owner').trim();
export const OWNER = () => ({ id: 'owner', name: ownerName(), role: 'owner' });
const nameKey = (n) => String(n || '').trim().toLowerCase();

// ---- passwords --------------------------------------------------------------
function hashPassword(password, salt = crypto.randomBytes(16).toString('base64url')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('base64url');
  return { salt, hash };
}
export function verifyPassword(password, user) {
  if (typeof password !== 'string' || !user?.salt) return false;
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash), b = Buffer.from(user.hash || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- users ------------------------------------------------------------------------
// Read from the store on every call: on Vercel several function instances run
// at once, and a per-instance cache made a just-joined (or just-removed) user
// invisible (or still valid) on the others. It's one hash of ≤ MAX_MEMBERS entries.
export async function listUsers() {
  const raw = await hashGetAll(USERS);
  return Object.values(raw).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean);
}
const invalidate = () => {};

export async function getUser(id) {
  if (id === 'owner') return OWNER();
  return (await listUsers()).find((u) => u.id === id) || null;
}
export async function findByName(name) {
  const k = nameKey(name);
  if (k === nameKey(ownerName())) return OWNER();
  return (await listUsers()).find((u) => u.nameKey === k) || null;
}
export const publicUser = (u) => u && ({ id: u.id, name: u.name, role: u.role || 'member', createdAt: u.createdAt || null });

// ---- invites ----------------------------------------------------------------------
export async function listInvites() {
  const raw = await hashGetAll(INVITES);
  const now = Date.now();
  return Object.values(raw).map((v) => { try { return JSON.parse(v); } catch { return null; } })
    .filter((i) => i && !i.usedBy && i.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createInvite() {
  const users = await listUsers();
  const pending = await listInvites();
  if (users.length + pending.length >= MAX_MEMBERS) {
    throw Object.assign(new Error(`This Mosaic is limited to ${MAX_MEMBERS} people besides you (counting open invites).`), { status: 409 });
  }
  const invite = { code: crypto.randomBytes(12).toString('base64url'), createdAt: Date.now(), expiresAt: Date.now() + INVITE_TTL_MS, usedBy: null };
  await hashUpdate(INVITES, { set: { [invite.code]: JSON.stringify(invite) } });
  return invite;
}

export const revokeInvite = (code) => hashUpdate(INVITES, { del: [String(code)] });

export async function checkInvite(code) {
  const raw = code && await hashGet(INVITES, String(code));
  const inv = raw ? JSON.parse(raw) : null;
  if (!inv || inv.usedBy || inv.expiresAt < Date.now()) return null;
  return inv;
}

export async function joinWithInvite(code, name, password) {
  const inv = await checkInvite(code);
  if (!inv) throw Object.assign(new Error('This invite link is no longer valid — ask for a new one.'), { status: 410 });
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 40) throw Object.assign(new Error('Pick a name between 2 and 40 characters.'), { status: 400 });
  if (typeof password !== 'string' || password.length < 8) throw Object.assign(new Error('Use a password of at least 8 characters.'), { status: 400 });
  if (await findByName(clean)) throw Object.assign(new Error('That name is taken — pick another.'), { status: 409 });
  if ((await listUsers()).length >= MAX_MEMBERS) throw Object.assign(new Error('This Mosaic is full.'), { status: 409 });
  const user = { id: crypto.randomBytes(8).toString('hex'), name: clean, nameKey: nameKey(clean), role: 'member', createdAt: Date.now(), ...hashPassword(password) };
  await hashUpdate(USERS, { set: { [user.id]: JSON.stringify(user) } });
  await hashUpdate(INVITES, { set: { [inv.code]: JSON.stringify({ ...inv, usedBy: user.id, usedAt: Date.now() }) } });
  invalidate();
  return user;
}

// Remove a member: their account, their whole record, and anything they shared.
export async function removeUser(id) {
  if (!id || id === 'owner') throw Object.assign(new Error("The owner can't be removed."), { status: 400 });
  await hashUpdate(USERS, { del: [id] });
  await hashDrop(recordHash(id));
  const shared = await hashGetAll(SHARED);
  const mine = Object.keys(shared).filter((k) => k.startsWith(`${id}:`));
  if (mine.length) await hashUpdate(SHARED, { del: mine });
  invalidate();
}

// ---- shared threads (read-only snapshots) ------------------------------------------------
export async function listShared() {
  const raw = await hashGetAll(SHARED);
  return Object.entries(raw).map(([key, v]) => {
    try { const [userId, threadId] = key.split(':'); return { userId, threadId, ...JSON.parse(v) }; } catch { return null; }
  }).filter(Boolean);
}
export const putShared = (userId, threadId, snapshot) =>
  hashUpdate(SHARED, { set: { [`${userId}:${threadId}`]: JSON.stringify({ ...snapshot, updatedAt: Date.now() }) } });
export const dropShared = (userId, threadId) => hashUpdate(SHARED, { del: [`${userId}:${threadId}`] });
