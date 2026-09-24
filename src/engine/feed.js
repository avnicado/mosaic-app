// Filling the four slots. Rule carried over from the demo: MODELS NEVER
// PRODUCE URLS. Primary path is retrieve→select — the model writes a search
// query, a real search API (/api/search → Tavily) returns real results, and a
// second call picks one; a pick whose URL isn't in the results is rejected.
// Fallback: a knowledge tier gated in code to English-Wikipedia article URLs.
// Every accepted item passes a liveness check (/api/checkurl).

import { callLLM, parseJSON, apiFetch, sleep, suggestedWaitMs } from './llm.js';
import { SLOTS, searchQueryPrompt, selectFromResultsPrompt, knowledgePrompt } from './prompts.js';
import { normalizeMediaType, normalizeField, normalizeTopics } from '../media.js';

const TIMEOUT_MS = 120000;
const WIKI_RE = /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s#?]+$/;

function withTimeout(p) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

// Groq's free tier shares one tokens-per-minute budget across every call and
// says exactly how long to wait — honor that instead of guessing.
async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      const msg = e?.message || '';
      if (i === attempts - 1) throw e;
      const wait = suggestedWaitMs(msg);
      if (wait !== null) await sleep(Math.min(wait + 500, 30000));
      else if (/429|rate.?limit/i.test(msg)) await sleep(6000);
      else if (/no content in model response|entity too large|413/i.test(msg)) await sleep(600);
      else throw e;
    }
  }
}

// 'ok' | 'unknown' (checker couldn't tell — accepted, labeled honestly) | 'dead'
export async function verifyUrl(url) {
  if (!url) return 'dead';
  try {
    const res = await apiFetch('/api/checkurl', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
    });
    if (!res.ok) return 'unknown';
    const data = await res.json();
    if (/assumed_alive|inconclusive/.test(data.reason || '')) return data.ok ? 'unknown' : 'dead';
    return data.ok ? 'ok' : 'dead';
  } catch { return 'unknown'; }
}

async function searchSelect(slot, ctx, exclude) {
  const qText = await withRetry(() => withTimeout(callLLM({ prompt: searchQueryPrompt(slot, ctx, exclude), maxTokens: 500 })));
  const { query } = parseJSON(qText);
  if (!query || !String(query).trim()) throw new Error('no search query produced');

  const sres = await apiFetch('/api/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: String(query), maxResults: 7 }),
  });
  const sdata = await sres.json().catch(() => ({}));
  if (sres.status === 503 && sdata?.error?.type === 'no_search_key') throw Object.assign(new Error('search not configured'), { noSearchKey: true });
  if (!sres.ok) throw new Error(sdata?.error?.message || `search error (${sres.status})`);
  const candidates = (sdata.results || []).filter((r) => !exclude.includes(r.url)).slice(0, 7);
  if (!candidates.length) throw new Error('search returned no candidates');

  const sel = parseJSON(await withRetry(() => withTimeout(callLLM({ prompt: selectFromResultsPrompt(slot, ctx, candidates), maxTokens: 1400 }))));
  const match = candidates.find((r) => r.url === sel.url)
    || candidates.find((r) => sel.url && (r.url.startsWith(sel.url) || String(sel.url).startsWith(r.url)));
  if (!match) throw new Error('selection did not use a candidate URL — rejected');
  return { ...sel, url: match.url, query: String(query) };
}

const pick = (it) => ({
  title: String(it.title || '').trim(),
  source: String(it.source || '').trim(),
  url: it.url,
  mediaType: normalizeMediaType(it.mediaType, it.url),
  preview: String(it.preview || '').trim(),
  why: String(it.why || '').trim(),
  field: normalizeField(it.field),
  topics: normalizeTopics(it.topics),
});

// → { slot, title, source, url, mediaType, preview, why, provenance, linkCheck } | { slot, failed: true, error }
export async function fillSlot(slot, ctx, exclude = []) {
  let lastError = 'failed';
  try {
    const item = await searchSelect(slot, ctx, exclude);
    const linkCheck = await verifyUrl(item.url);
    if (linkCheck !== 'dead') return { slot, ...pick(item), provenance: 'search', linkCheck };
    lastError = 'dead link from search: ' + item.url;
  } catch (e) {
    lastError = e.message;
    console.warn(`[feed] ${slot} retrieve→select failed:`, e.message);
  }
  for (const retry of [false, true]) {
    try {
      const item = parseJSON(await withRetry(() => withTimeout(callLLM({ prompt: knowledgePrompt(slot, ctx, exclude, retry), maxTokens: 1000 }))));
      if (!WIKI_RE.test(item.url || '')) { lastError = 'non-Wikipedia URL from knowledge tier'; continue; }
      if (exclude.includes(item.url)) { lastError = 'duplicate'; continue; }
      const linkCheck = await verifyUrl(item.url);
      if (linkCheck === 'dead') { lastError = 'dead link: ' + item.url; continue; }
      return { slot, ...pick(item), mediaType: 'reference', provenance: 'knowledge', linkCheck };
    } catch (e) { lastError = e.message; }
  }
  return { slot, failed: true, error: lastError };
}

// Fill all slots in parallel (Groq takes what its rate limit allows; on a
// local server a rate-limited call falls back to Claude). If two slots land
// on the same URL, the later slot is refilled. onItem(item) streams results.
export async function runFeed(ctx, { exclude = [], slots = SLOTS, onItem = () => {} } = {}) {
  const out = await Promise.all(slots.map((slot) => fillSlot(slot, ctx, exclude)));
  const seen = new Set(exclude);
  for (let i = 0; i < out.length; i++) {
    if (out[i].url && seen.has(out[i].url)) out[i] = await fillSlot(out[i].slot, ctx, [...seen]);
    if (out[i].url) seen.add(out[i].url);
    onItem(out[i]);
  }
  return out;
}
