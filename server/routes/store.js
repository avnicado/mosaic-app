// GET  /api/store → { data: { "m2:key": "value", ... } }   the signed-in user's whole record
// POST /api/store   { set: { key: value }, del: [key] } → { ok: true }
// Each user has a private record (server/store.js → recordHash).

import { requireAuth } from '../auth.js';
import { readRecord, writeRecord } from '../store.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      res.setHeader('cache-control', 'no-store');
      res.status(200).json({ data: await readRecord(user.id), userId: user.id });
      return;
    }
    if (req.method === 'POST') {
      await writeRecord(user.id, req.body || {});
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST' } });
  } catch (e) {
    res.status(e.status || 502).json({ error: { type: 'store_error', message: e.message } });
  }
}
