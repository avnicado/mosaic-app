// POST /api/further { lean, lang? } → { items, added, fit, searched, calls, ms }
// When a Promenade lean runs thin, search the web for it, score the results
// with the corpus scorer and add them to the day's pool (server/further.js).
// Signed-in people only; limited per person and per day.

import { requireAuth } from '../auth.js';
import { lookFurther } from '../further.js';

export default async function handler(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  try {
    const out = await lookFurther(user, body.lean, { lang: body.lang === 'he' ? 'he' : 'en' });
    res.status(200).json(out);
  } catch (e) {
    if (!e.status) console.error('[further]', e);
    res.status(e.status || 502).json({ error: { type: e.type || 'further_error', message: e.message } });
  }
}
