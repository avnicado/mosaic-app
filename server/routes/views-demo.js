// /api/views-demo — the views on a thread's question, for every signed-in user.
// New maps and ring lookups are capped per person per hour and in total per
// day (server/viewsDemo.js); the owner is not capped; cached answers are free.
//   GET            → { live } : can a typed question be mapped here right now?
//   POST {question} → a map (server/viewsDemo.js), capped and cached.
//   POST {ring} (or GET ?ring=<json>) → pieces arguing each answer of one ring.

import { requireAuth } from '../auth.js';
import { mapLive, liveReady, ringSides } from '../viewsDemo.js';
import PROBE_RINGS from '../probe-rings.json' with { type: 'json' };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  // TEMP (to be removed; never on main): a preview-only probe of one ring's
  // lookup for the quality test Gil asked for on 2026-11-25. No sign-in, no
  // cap, and no store: MOSAIC_DATA_DIR turns Redis off for this instance, so
  // nothing is cached or counted in the shared record.
  if (process.env.VERCEL_ENV === 'preview' && req.query?.probe === '1' && (req.query?.ring || req.query?.id)) {
    process.env.MOSAIC_DATA_DIR = '/tmp/views-probe';
    try {
      const ring = req.query.id
        ? PROBE_RINGS.find((x) => x.id === String(req.query.id))?.ring
        : JSON.parse(String(req.query.ring));
      if (!ring) throw Object.assign(new Error('no such probe ring'), { status: 404 });
      const t0 = Date.now();
      const out = await ringSides(ring, { ip: 'probe', unlimited: true });
      res.status(200).json({ ms: Date.now() - t0, ...out });
    } catch (e) {
      res.status(e.status || 502).json({ error: String(e.message || e).slice(0, 300) });
    }
    return;
  }
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
