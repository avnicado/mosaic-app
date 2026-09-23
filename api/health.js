// GET /api/health — lets the client detect whether the server has an API key,
// so the demo can fall back to the canned sample session instead of breaking.

import { hasKey, hasSearchKey } from '../server/proxyCore.js';

export default function handler(req, res) {
  res.status(200).json({ hasKey: hasKey(), hasSearchKey: hasSearchKey() });
}
