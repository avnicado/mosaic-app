// GET /api/corpus → the Promenade corpus ({meta, items}), refreshed daily.
//
// Served from a cached copy; rebuilt (≈10s: Hacker News + RSS, scored by
// src/scoring.js) when the cache is missing or older than MAX_AGE, or when
// Vercel Cron calls with ?refresh=1. If a rebuild fails, the stale copy is
// served; if there is none, 503 — the client then falls back to the static
// /corpus.json committed in the repo.

import crypto from 'node:crypto';
import { requireAuth } from '../server/auth.js';
import { getBlob, setBlob } from '../server/store.js';
import { buildCorpus } from '../server/corpus.js';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
function isCron(req) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers?.authorization || '';
  const want = `Bearer ${secret}`;
  return !!secret && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export default async function handler(req, res) {
  if (!isCron(req) && !(await requireAuth(req, res))) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'GET only' } });
    return;
  }
  const force = req.query?.refresh === '1';
  let cached = null;
  try { cached = await getBlob('corpus'); } catch (e) { console.warn('[corpus] cache read failed:', e.message); }
  let corpus = null;
  if (cached) { try { corpus = JSON.parse(cached); } catch {} }
  const age = corpus?.meta?.generatedAt ? Date.now() - Date.parse(corpus.meta.generatedAt) : Infinity;

  if (force || age > MAX_AGE_MS) {
    try {
      const fresh = await buildCorpus({ log: () => {}, warn: (...a) => console.warn(...a) });
      corpus = fresh;
      try { await setBlob('corpus', JSON.stringify(fresh)); } catch (e) { console.warn('[corpus] cache write failed:', e.message); }
    } catch (e) {
      console.warn('[corpus] rebuild failed:', e.message);
      if (!corpus) {
        res.status(503).json({ error: { type: 'corpus_unavailable', message: e.message } });
        return;
      }
    }
  }
  res.setHeader('cache-control', 'private, no-store');
  res.status(200).json(corpus);
}
