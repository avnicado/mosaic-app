// POST /api/checkurl — server-side liveness check for feed-item URLs.
// The client can't HEAD arbitrary origins (CORS), so this runs the check here.
// Legibility invariant, applied to links: an item whose "source" can't be
// opened is worse than no item. YouTube URLs are checked via oEmbed (a 404
// there means the video doesn't exist); everything else gets HEAD with a GET
// fallback (some origins reject HEAD).

import { checkUrl } from '../proxyCore.js';
import { requireAuth } from '../auth.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const url = req.body?.url;
  const result = await checkUrl(url);
  res.status(200).json(result);
}
