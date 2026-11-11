// Headless check of the feedback route, in-process, against a throwaway file store:
//   node scripts/feedback-smoke.mjs
// Never touches the live record: MOSAIC_DATA_DIR forces files and ignores Upstash keys.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.MOSAIC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mosaic-feedback-'));
process.env.APP_PASSWORD = 'owner-password-for-test';
delete process.env.VERCEL;

const { default: feedback } = await import('../server/routes/feedback.js');
const { sessionCookie } = await import('../server/auth.js');
const { createInvite, joinWithInvite } = await import('../server/users.js');

const call = async (cookie, method, body, query = {}) => {
  const req = { method, body, query, headers: { cookie } };
  let out = { status: 200, json: null };
  const res = {
    setHeader() {},
    status(c) { out.status = c; return res; },
    json(o) { out.json = o; return res; },
  };
  await feedback(req, res);
  return out;
};
let failed = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) failed++; };

const inv = await createInvite();
const member = await joinWithInvite(inv.code, 'Test Member', 'member-password-1');
const ownerCookie = sessionCookie('owner').split(';')[0];
const memberCookie = sessionCookie(member.id).split(';')[0];

check('signed-out send is refused', (await call('', 'POST', { message: 'hi' })).status === 401);
check('empty message is refused', (await call(memberCookie, 'POST', { message: '   ' })).status === 400);
check('too-long message is refused', (await call(memberCookie, 'POST', { message: 'x'.repeat(4001) })).status === 413);

const sent = await call(memberCookie, 'POST', { message: 'The reef is empty.', kind: 'idea', page: 'library', device: 'phone-width' });
check('member can send', sent.status === 200 && sent.json.ok);
check('member cannot read', (await call(memberCookie, 'GET')).status === 403);
check('member cannot mark', (await call(memberCookie, 'POST', { action: 'read', id: 'x' })).status === 403);

const list = await call(ownerCookie, 'GET');
const note = list.json?.items?.[0];
check('owner reads the note', list.status === 200 && list.json.items.length === 1 && list.json.unread === 1);
check('note carries sender, kind and page', note?.userName === 'Test Member' && note.kind === 'idea' && note.page === 'library', JSON.stringify(note));
check('count shortcut', (await call(ownerCookie, 'GET', undefined, { count: '1' })).json.unread === 1);

await call(memberCookie, 'POST', { message: 'odd', kind: 'nonsense', page: '../etc' });
const second = (await call(ownerCookie, 'GET')).json.items[0];
check('bad kind and page are normalised', second.kind === 'other' && second.page === '');

check('owner marks read', (await call(ownerCookie, 'POST', { action: 'read', id: note.id })).status === 200);
check('unread count drops', (await call(ownerCookie, 'GET', undefined, { count: '1' })).json.unread === 1);
check('owner deletes', (await call(ownerCookie, 'POST', { action: 'delete', id: note.id })).status === 200);
check('one note left', (await call(ownerCookie, 'GET')).json.items.length === 1);

let last;
for (let i = 0; i < 25; i++) last = await call(memberCookie, 'POST', { message: `note ${i}` });
check('daily limit stops the 21st note', last.status === 429, String(last.status));

fs.rmSync(process.env.MOSAIC_DATA_DIR, { recursive: true, force: true });
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
