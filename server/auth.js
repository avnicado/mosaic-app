// Sign-in for a small group. The owner signs in with APP_PASSWORD (name =
// OWNER_NAME, default "owner"); invited members with their own name+password
// (server/users.js). One signed HttpOnly cookie carries the user id.
//
// No APP_PASSWORD: local dev is open (you're the owner unless signed in as
// someone else); on Vercel everything is refused (fail closed — a deployment
// that forgot the env var must not be a free public proxy for your keys).

import crypto from 'node:crypto';
import { getUser, findByName, verifyPassword, OWNER } from './users.js';

const COOKIE = 'm2_session';
const MAX_AGE_S = 60 * 60 * 24 * 90; // 90 days

const onVercel = () => !!process.env.VERCEL;
const password = () => process.env.APP_PASSWORD || '';
// Signing key: SESSION_SECRET, else APP_PASSWORD, else a per-process key (dev).
const devKey = crypto.randomBytes(32).toString('hex');
const secret = () => process.env.SESSION_SECRET || password() || devKey;

export function authMode() {
  if (password()) return 'password';
  return onVercel() ? 'locked' : 'open';
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function readCookie(req, name) {
  for (const part of (req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// → the signed-in user ({id, name, role}) or null.
export async function currentUser(req) {
  if (authMode() === 'locked') return null;
  const tok = readCookie(req, COOKIE);
  if (tok) {
    const [uid, exp, sig] = tok.split('.');
    if (uid && exp && sig && Number(exp) > Date.now() / 1000 && safeEqual(sig, sign(`${uid}.${exp}`))) {
      const u = await getUser(uid);
      if (u) return u;
    }
    // A cookie that no longer checks out (expired, removed user, rotated key)
    // means "signed out" — never fall through to the owner's record.
    return null;
  }
  return authMode() === 'open' ? OWNER() : null;
}

function cookieHeader(value, maxAge) {
  const secure = onVercel() ? '; Secure' : '';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export function sessionCookie(userId) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return cookieHeader(`${userId}.${exp}.${sign(`${userId}.${exp}`)}`, MAX_AGE_S);
}
export const logoutCookie = () => cookieHeader('', 0);

// Brute-force brake: failed attempts per IP, in memory per instance.
const fails = new Map();
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 10;
export function loginBlocked(ip) {
  const f = fails.get(ip);
  return !!(f && Date.now() - f.start < FAIL_WINDOW_MS && f.count >= FAIL_MAX);
}
export function noteFailure(ip) {
  const now = Date.now();
  const f = fails.get(ip);
  const entry = f && now - f.start < FAIL_WINDOW_MS ? f : { start: now, count: 0 };
  entry.count += 1;
  fails.set(ip, entry);
}

// → { ok, cookie, user } | { ok:false, status, message }
export async function checkLogin(name, given, ip) {
  if (loginBlocked(ip)) return { ok: false, status: 429, message: 'Too many attempts — wait 15 minutes.' };
  if (authMode() === 'locked') return { ok: false, status: 503, message: 'APP_PASSWORD is not set on the server.' };
  const trimmed = String(name || '').trim();
  const user = trimmed ? await findByName(trimmed) : OWNER();
  let ok = false;
  if (user?.id === 'owner') ok = authMode() === 'open' || (typeof given === 'string' && safeEqual(given, password()));
  else if (user) ok = verifyPassword(given, user);
  else crypto.scryptSync(String(given || 'x'), 'timing-pad', 32); // don't reveal unknown names by timing
  if (!ok) { noteFailure(ip); return { ok: false, status: 401, message: 'Wrong name or password.' }; }
  fails.delete(ip);
  return { ok: true, user, cookie: sessionCookie(user.id) };
}

export function clientIp(req) {
  return (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// Resolves to the user if the request may proceed; otherwise answers 401 and resolves null.
export async function requireAuth(req, res) {
  const user = await currentUser(req);
  if (user) return user;
  const locked = authMode() === 'locked';
  res.status(401).json({
    error: { type: locked ? 'not_configured' : 'unauthorized', message: locked ? 'APP_PASSWORD is not set on the server.' : 'Sign in first.' },
  });
  return null;
}

export const requireOwner = async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'owner') { res.status(403).json({ error: { type: 'forbidden', message: 'Only the owner can do that.' } }); return null; }
  return user;
};
