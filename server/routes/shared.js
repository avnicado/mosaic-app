// Opt-in, read-only shared threads.
// GET  /api/shared → { mine:[threadId], others:[{ threadId, owner:{id,name}, snapshot, updatedAt }] }
// POST /api/shared { threadId, snapshot }        publish/refresh one of MY threads
//                  { threadId, remove: true }    stop sharing it

import { requireAuth } from '../auth.js';
import { listShared, putShared, dropShared, getUser } from '../users.js';

const MAX_SNAPSHOT = 800_000;

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      const all = await listShared();
      const others = [];
      for (const s of all.filter((x) => x.userId !== user.id)) {
        const owner = await getUser(s.userId);
        if (!owner) continue; // removed user
        others.push({ threadId: s.threadId, owner: { id: owner.id, name: owner.name }, snapshot: s.snapshot, updatedAt: s.updatedAt });
      }
      others.sort((a, b) => b.updatedAt - a.updatedAt);
      res.status(200).json({ mine: all.filter((x) => x.userId === user.id).map((x) => x.threadId), others });
      return;
    }
    if (req.method === 'POST') {
      const { threadId, snapshot, remove } = req.body || {};
      if (typeof threadId !== 'string' || !/^[\w-]{1,64}$/.test(threadId)) { res.status(400).json({ error: { type: 'bad_request', message: 'threadId required.' } }); return; }
      if (remove) { await dropShared(user.id, threadId); res.status(200).json({ ok: true }); return; }
      if (!snapshot || typeof snapshot !== 'object') { res.status(400).json({ error: { type: 'bad_request', message: 'snapshot required.' } }); return; }
      if (JSON.stringify(snapshot).length > MAX_SNAPSHOT) { res.status(413).json({ error: { type: 'too_large', message: 'Thread too large to share.' } }); return; }
      await putShared(user.id, threadId, { snapshot });
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST' } });
  } catch (e) {
    res.status(e.status || 502).json({ error: { type: 'shared_error', message: e.message } });
  }
}
