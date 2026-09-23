// POST /api/join { code, name, password } → creates a member account from a
// one-time invite and signs them in.

import { sessionCookie, clientIp, loginBlocked, noteFailure } from '../server/auth.js';
import { joinWithInvite, publicUser } from '../server/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const ip = clientIp(req);
  if (loginBlocked(ip)) { res.status(429).json({ error: { type: 'rate_limited', message: 'Too many attempts — wait 15 minutes.' } }); return; }
  try {
    const { code, name, password } = req.body || {};
    const user = await joinWithInvite(code, name, password);
    res.setHeader('set-cookie', sessionCookie(user.id));
    res.status(200).json({ ok: true, user: publicUser(user) });
  } catch (e) {
    if (e.status === 410) noteFailure(ip);
    res.status(e.status || 502).json({ error: { type: 'join_failed', message: e.message } });
  }
}
