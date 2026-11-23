// /api/views-demo — maps the views on a question for the thread page. Owner only
// for now (the standalone /views page is left out of the live site).
//   GET            → { live } : can a typed question be mapped here right now?
//   POST {question} → a map (server/viewsDemo.js), capped and cached.

import { clientIp, requireOwner } from '../auth.js';
import { mapLive, liveReady } from '../viewsDemo.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!(await requireOwner(req, res))) return;
  if (req.method === 'GET') {
    res.status(200).json({ live: liveReady() });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST only' } });
    return;
  }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  try {
    const out = await mapLive(body.question, { ip: clientIp(req) });
    res.status(200).json(out);
  } catch (e) {
    if (!e.status) console.error('[views-demo]', e);
    res.status(e.status || 502).json({ error: { type: e.type || 'views_error', message: e.status ? e.message : 'Something went wrong mapping that question. Try again, or open a ready example.' } });
  }
}
