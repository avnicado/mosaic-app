// GET /api/read?url=… → { ok, title, byline, siteName, published, html, words, minutes }
// The article on that page, extracted for the Mosaic reader (server/reader.js).
// On failure: { ok: false, reason, message } with reason one of
// gone | blocked | empty | pdf | bad_url | error — the reader then offers the site.

import { requireAuth } from '../auth.js';
import { readArticle } from '../reader.js';

const cache = new Map(); // url → { at, body }; per instance, best effort
const TTL = 30 * 60 * 1000;

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const url = String(req.query?.url || new URL(req.url, 'http://x').searchParams.get('url') || '');
  res.setHeader('cache-control', 'private, max-age=1800');
  if (!/^https?:\/\//i.test(url)) { res.status(400).json({ ok: false, reason: 'bad_url', message: 'Not a web address.' }); return; }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) { res.status(200).json(hit.body); return; }
  try {
    const body = await readArticle(url);
    cache.set(url, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    res.status(200).json(body);
  } catch (e) {
    const reason = e.gone ? 'gone' : e.pdf ? 'pdf' : e.empty ? 'empty' : e.blocked ? 'blocked' : e.status === 400 ? 'bad_url' : 'error';
    res.status(200).json({ ok: false, reason, message: e.name === 'AbortError' ? 'The site took too long.' : e.message });
  }
}
