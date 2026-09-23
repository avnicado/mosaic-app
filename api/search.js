// POST /api/search — server-side web search (Tavily) for slot filling.
// Retrieve→select: real results go to the model, which only chooses among
// them; URLs are never model-generated. See server/proxyCore.js.

import { handleSearch } from '../server/proxyCore.js';
import { requireAuth } from '../server/auth.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const { status, json } = await handleSearch(req.body, ip);
  res.status(status).json(json);
}
