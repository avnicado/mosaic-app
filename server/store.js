// Server-side storage. Everything is a Redis hash (Upstash REST) or, in local
// dev without Upstash, a JSON file per hash under .data/.
//
//   m2:record            the owner's record (one field per "m2:*" document key)
//   m2:record:<userId>   every other user's record
//   m2:users             userId → user JSON        (server/users.js)
//   m2:invites           code → invite JSON        (server/users.js)
//   m2:shared            "<userId>:<threadId>" → shared-thread snapshot JSON
//   m2-blob:<name>       single cached values (the daily Promenade corpus)
//
// Upstash env (Vercel Marketplace → Upstash): KV_REST_API_URL/KV_REST_API_TOKEN
// or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN. On Vercel without them we
// refuse rather than pretend (file storage isn't durable there).

import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_VALUE_BYTES = 900_000; // Upstash request limit is ~1MB
const DATA_DIR = process.env.MOSAIC_DATA_DIR || path.join(process.cwd(), '.data'); // override for isolated test servers

function upstash() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function storeMode() {
  if (upstash()) return 'redis';
  return process.env.VERCEL ? 'none' : 'file';
}

const noStore = () => Object.assign(new Error('No store configured (add Upstash Redis to the Vercel project).'), { status: 503 });

async function redis(commands) {
  const { url, token } = upstash();
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `store error ${res.status}`);
  for (const r of json) if (r.error) throw new Error(r.error);
  return json.map((r) => r.result);
}

// ---- file backend (dev) ------------------------------------------------------
const fileFor = (hash) => path.join(DATA_DIR, `${hash.replace(/[^a-zA-Z0-9_-]+/g, '_')}.json`);
// The owner's record predates the multi-user layout; keep its old file name.
const legacyFile = (hash) => (hash === 'm2:record' ? path.join(DATA_DIR, 'store.json') : fileFor(hash));
async function readFile(hash) {
  try { return JSON.parse(await fs.readFile(legacyFile(hash), 'utf8')); } catch { return {}; }
}
// Serialize writes per file so parallel requests can't lose each other's updates.
const fileLocks = new Map();
async function updateFile(hash, fn) {
  const prev = fileLocks.get(hash) || Promise.resolve();
  const next = prev.then(async () => {
    const data = await readFile(hash);
    fn(data);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const f = legacyFile(hash), tmp = f + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data));
    await fs.rename(tmp, f);
  });
  fileLocks.set(hash, next.catch(() => {}));
  return next;
}

// ---- generic hash operations -------------------------------------------------------
export async function hashGetAll(hash) {
  const mode = storeMode();
  if (mode === 'redis') {
    const [flat] = await redis([['HGETALL', hash]]);
    const out = {};
    for (let i = 0; i + 1 < (flat || []).length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  }
  if (mode === 'file') return readFile(hash);
  throw noStore();
}

export async function hashGet(hash, field) {
  const mode = storeMode();
  if (mode === 'redis') { const [v] = await redis([['HGET', hash, field]]); return v ?? null; }
  if (mode === 'file') return (await readFile(hash))[field] ?? null;
  throw noStore();
}

export async function hashUpdate(hash, { set = {}, del = [] }) {
  const keys = Object.keys(set);
  const mode = storeMode();
  if (mode === 'redis') {
    const cmds = [];
    if (keys.length) cmds.push(['HSET', hash, ...keys.flatMap((k) => [k, set[k]])]);
    if (del.length) cmds.push(['HDEL', hash, ...del]);
    if (cmds.length) await redis(cmds);
    return;
  }
  if (mode === 'file') {
    await updateFile(hash, (data) => { for (const k of keys) data[k] = set[k]; for (const k of del) delete data[k]; });
    return;
  }
  throw noStore();
}

export async function hashDrop(hash) {
  const mode = storeMode();
  if (mode === 'redis') { await redis([['DEL', hash]]); return; }
  if (mode === 'file') { await fs.rm(legacyFile(hash), { force: true }); return; }
  throw noStore();
}

// ---- a user's record ----------------------------------------------------------------
export const recordHash = (userId) => (userId === 'owner' ? 'm2:record' : `m2:record:${userId}`);

export const readRecord = (userId) => hashGetAll(recordHash(userId));

// set: {key: stringValue}, del: [key] — keys must be "m2:*" record documents.
export async function writeRecord(userId, { set = {}, del = [] }) {
  const keys = Object.keys(set);
  for (const k of [...keys, ...del]) {
    if (typeof k !== 'string' || !k.startsWith('m2:') || k.length > 300) {
      throw Object.assign(new Error(`bad key: ${String(k).slice(0, 60)}`), { status: 400 });
    }
  }
  for (const k of keys) {
    if (typeof set[k] !== 'string') throw Object.assign(new Error(`value for ${k} must be a string`), { status: 400 });
    if (set[k].length > MAX_VALUE_BYTES) throw Object.assign(new Error(`value for ${k} too large`), { status: 413 });
  }
  await hashUpdate(recordHash(userId), { set, del });
}

// ---- single cached blobs --------------------------------------------------------------
const blobFile = (name) => path.join(DATA_DIR, `${name}.json`);

export async function getBlob(name) {
  const mode = storeMode();
  if (mode === 'redis') { const [v] = await redis([['GET', `m2-blob:${name}`]]); return v ?? null; }
  if (mode === 'file') { try { return await fs.readFile(blobFile(name), 'utf8'); } catch { return null; } }
  return null;
}

export async function setBlob(name, value) {
  const mode = storeMode();
  if (mode === 'redis') { await redis([['SET', `m2-blob:${name}`, value]]); return; }
  if (mode === 'file') { await fs.mkdir(DATA_DIR, { recursive: true }); await fs.writeFile(blobFile(name), value); }
}
