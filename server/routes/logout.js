// POST /api/logout → clears the session cookie.

import { logoutCookie } from '../auth.js';

export default async function handler(req, res) {
  res.setHeader('set-cookie', logoutCookie());
  res.status(200).json({ ok: true });
}
