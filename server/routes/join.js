// POST /api/join { code?, name, password } → creates a member account and signs
// them in. With a code it uses a one-time invite; without one it is open sign-up
// (refused when OPEN_SIGNUP=off).

import { sessionCookie, clientIp, loginBlocked, noteFailure } from '../auth.js';
import { joinWithInvite, signUp, publicUser } from '../users.js';

// Open sign-up brake: new accounts per IP, in memory per instance.
const signups = new Map();
const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_MAX = 3;
function signupBlocked(ip) {
  const now = Date.now();
  const f = signups.get(ip);
  return !!(f && now - f.start < SIGNUP_WINDOW_MS && f.count >= SIGNUP_MAX);
}
function noteSignup(ip) {
  const now = Date.now();
  const f = signups.get(ip);
  const entry = f && now - f.start < SIGNUP_WINDOW_MS ? f : { start: now, count: 0 };
  entry.count += 1;
  signups.set(ip, entry);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const ip = clientIp(req);
  if (loginBlocked(ip)) { res.status(429).json({ error: { type: 'rate_limited', message: 'Too many attempts — wait 15 minutes.' } }); return; }
  try {
    const { code, name, password } = req.body || {};
    if (!code && signupBlocked(ip)) { res.status(429).json({ error: { type: 'rate_limited', message: 'Too many new accounts from here — try again in an hour.' } }); return; }
    const user = code ? await joinWithInvite(code, name, password) : await signUp(name, password);
    if (!code) noteSignup(ip);
    res.setHeader('set-cookie', sessionCookie(user.id));
    res.status(200).json({ ok: true, user: publicUser(user) });
  } catch (e) {
    if (e.status === 410) noteFailure(ip);
    res.status(e.status || 502).json({ error: { type: 'join_failed', message: e.message } });
  }
}
