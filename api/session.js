// GET /api/session → { authed, user:{id,name,role}|null, mode, store, llm }
// mode: 'password' | 'open' (local dev, no APP_PASSWORD) | 'locked' (deployed without APP_PASSWORD)
// store: 'redis' | 'file' (local dev) | 'none' (deployed without Upstash)

import { currentUser, authMode } from '../server/auth.js';
import { storeMode } from '../server/store.js';
import { llmBackends } from '../server/proxyCore.js';
import { publicUser, checkInvite } from '../server/users.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  let user = null;
  try { user = await currentUser(req); } catch (e) { console.warn('[session]', e.message); }
  const out = { authed: !!user, user: publicUser(user), mode: authMode(), store: storeMode(), llm: llmBackends() };
  // Let the sign-in screen know whether an invite link is still good.
  if (req.query?.invite) { try { out.inviteValid = !!(await checkInvite(req.query.invite)); } catch { out.inviteValid = false; } }
  res.status(200).json(out);
}
