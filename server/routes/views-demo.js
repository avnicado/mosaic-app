// /api/views-demo — the views on a thread's question, for every signed-in user.
// New maps and ring lookups are capped per person per hour and in total per
// day (server/viewsDemo.js); the owner is not capped; cached answers are free.
//   GET            → { live } : can a typed question be mapped here right now?
//   POST {question} → a map (server/viewsDemo.js), capped and cached.
//   POST {ring} (or GET ?ring=<json>) → pieces arguing each answer of one ring.

import { requireAuth } from '../auth.js';
import { mapLive, liveReady, ringSides } from '../viewsDemo.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const user = await requireAuth(req, res);
  if (!user) return;
  const who = { ip: `u:${user.id}`, unlimited: user.role === 'owner' };
  const ringParam = req.method === 'GET' && req.query?.ring;
  if (req.method === 'GET' && !ringParam) {
    res.status(200).json({ live: liveReady() });
    return;
  }
  if (req.method !== 'POST' && !ringParam) {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST only' } });
    return;
  }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  try {
    // {ring: {question, crux: {question, left, right}, have}} → pieces arguing each answer of one ring.
    const ring = ringParam ? (() => { try { return JSON.parse(String(ringParam)); } catch { return null; } })() : body.ring;
    if (ring) {
      res.status(200).json(await ringSides(ring, who));
      return;
    }
    const out = await mapLive(body.question, who);
    res.status(200).json(out);
  } catch (e) {
    if (!e.status) console.error('[views-demo]', e);
    res.status(e.status || 502).json({ error: { type: e.type || 'views_error', message: e.status ? e.message : 'Something went wrong mapping that question. Try again, or open a ready example.' } });
  }
}
