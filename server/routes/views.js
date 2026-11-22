// POST /api/views { question, presuppositions?, force? } → a views map
// (server/views.js). The owner (admin) only, for now: everyone else gets 403.

import { requireOwner } from '../auth.js';
import { mapViews } from '../views.js';

export default async function handler(req, res) {
  const user = await requireOwner(req, res);
  if (!user) return;
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  try {
    const out = await mapViews({ question: body.question, presuppositions: body.presuppositions, force: !!body.force });
    res.status(200).json(out);
  } catch (e) {
    if (!e.status) console.error('[views]', e);
    res.status(e.status || 502).json({ error: { type: e.type || 'views_error', message: e.message } });
  }
}
