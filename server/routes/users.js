// Owner-only account management.
// GET  /api/users → { users:[{id,name,createdAt}], invites:[{code,createdAt,expiresAt}], max }
// POST /api/users { action:'invite' } → { invite }
//                 { action:'revoke', code } | { action:'remove', id } → { ok }

import { requireOwner } from '../auth.js';
import { listUsers, listInvites, createInvite, revokeInvite, removeUser, publicUser, MAX_MEMBERS } from '../users.js';

export default async function handler(req, res) {
  if (!(await requireOwner(req, res))) return;
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      const [users, invites] = await Promise.all([listUsers(), listInvites()]);
      res.status(200).json({ users: users.map(publicUser), invites: invites.map(({ code, createdAt, expiresAt }) => ({ code, createdAt, expiresAt })), max: Number.isFinite(MAX_MEMBERS) ? MAX_MEMBERS : null });
      return;
    }
    if (req.method === 'POST') {
      const { action, code, id } = req.body || {};
      if (action === 'invite') { const inv = await createInvite(); res.status(200).json({ invite: { code: inv.code, createdAt: inv.createdAt, expiresAt: inv.expiresAt } }); return; }
      if (action === 'revoke') { await revokeInvite(code); res.status(200).json({ ok: true }); return; }
      if (action === 'remove') { await removeUser(id); res.status(200).json({ ok: true }); return; }
      res.status(400).json({ error: { type: 'bad_request', message: 'Unknown action.' } });
      return;
    }
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET or POST' } });
  } catch (e) {
    res.status(e.status || 502).json({ error: { type: 'users_error', message: e.message } });
  }
}
