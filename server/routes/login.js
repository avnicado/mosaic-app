// POST /api/login { name, password } → sets the session cookie.
// The owner may leave name empty (or use OWNER_NAME) and sign in with APP_PASSWORD.

import { checkLogin, clientIp } from '../auth.js';
import { publicUser } from '../users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  try {
    const r = await checkLogin(req.body?.name, req.body?.password, clientIp(req));
    if (!r.ok) { res.status(r.status).json({ error: { type: 'login_failed', message: r.message } }); return; }
    res.setHeader('set-cookie', r.cookie);
    res.status(200).json({ ok: true, user: publicUser(r.user) });
  } catch (e) {
    res.status(e.status || 502).json({ error: { type: 'login_error', message: e.message } });
  }
}
