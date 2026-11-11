// Feedback on the alpha, from anyone signed in to the owner.
// POST /api/feedback { message, kind?, page?, device? }  → { ok }     any signed-in person
// GET  /api/feedback                → { items:[note], unread }         owner only
// GET  /api/feedback?count=1        → { unread }                       owner only
// POST /api/feedback { action:'read'|'unread'|'delete', id } → { ok }  owner only

import { requireAuth } from '../auth.js';
import { listFeedback, addFeedback, markFeedback, deleteFeedback } from '../feedback.js';

const forbidden = (res) => res.status(403).json({ error: { type: 'forbidden', message: 'Only the owner can read feedback.' } });

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (user.role !== 'owner') return forbidden(res);
      const items = await listFeedback();
      const unread = items.filter((f) => !f.read).length;
      res.status(200).json(req.query?.count ? { unread } : { items, unread });
      return;
    }
    if (req.method === 'POST') {
      const { action = 'send', id } = req.body || {};
      if (action === 'send') {
        await addFeedback(user, req.body || {});
        res.status(200).json({ ok: true });
        return;
      }
      if (user.role !== 'owner') return forbidden(res);
      if (typeof id !== 'string' || !id) { res.status(400).json({ error: { type: 'bad_request', message: 'id required.' } }); return; }
      if (action === 'read' || action === 'unread') { await markFeedback(id, action === 'read'); res.status(200).json({ ok: true }); return; }
      if (action === 'delete') { await deleteFeedback(id); res.status(200).json({ ok: true }); return; }
      res.status(400).json({ error: { type: 'bad_request', message: 'Unknown action.' } });
      return;
    }
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST' } });
  } catch (e) {
    res.status(e.status || 502).json({ error: { type: 'feedback_error', message: e.message } });
  }
}
