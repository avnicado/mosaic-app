// The views mandala, server side (admin only for now; the route checks).
// One model call maps a question's views by their cruxes (or says it isn't
// contested). When it is, one search per view looks for a real piece written
// by someone who holds that view, and one more model call picks among the
// real results, or picks none. URLs are never model-written.
//
// Cost per question, at most: 2 Groq calls and MAX_VIEWS Tavily searches.
// A question already mapped is served from the store at no cost, and a daily
// cap keeps a runaway client from eating the Groq budget the feeds need.
//
// Store (server/store.js):  m2:views  "q:<hash>" → JSON map   "d:<YYYY-MM-DD>" → count

import { handleLLM, tavilySearch, hasSearchKey } from './proxyCore.js';
import { hashGet, hashUpdate, hashIncr } from './store.js';
import { junkReason } from './further.js';
import { hashString } from './corpus.js';
import { parseJSON, suggestedWaitMs } from '../src/engine/llm.js';
import { VIEWS_SYSTEM, PICK_SYSTEM, viewsPrompt, pickPrompt, normalizeViews, hostOf } from '../src/engine/views.js';

export const VIEWS_PER_DAY = Number(process.env.VIEWS_PER_DAY || 40);
const HASH = 'm2:views';
const CACHE_TTL_S = 30 * 24 * 3600;
const DEADLINE_MS = 52_000; // the function may run 60s (vercel.json)
const fail = (status, type, message) => Object.assign(new Error(message), { status, type });

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

async function groqJSON({ system, prompt, maxTokens, deadline, llm = handleLLM }) {
  let tokens = maxTokens;
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { status, json } = await llm({
      model: 'openai/gpt-oss-120b', reasoning_effort: 'low', max_tokens: tokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    }, 'views');
    if (status === 200) {
      const text = json?.choices?.[0]?.message?.content;
      if (text) { try { return parseJSON(text); } catch (e) { last = e; } }
      else last = new Error('No content in model response');
      tokens = Math.min(Math.round(tokens * 1.4), 2000);
      continue;
    }
    const msg = json?.error?.message || `LLM proxy ${status}`;
    last = new Error(msg);
    const wait = status === 429 ? (suggestedWaitMs(msg) ?? 8000) + 500 : status >= 500 ? 1500 : null;
    if (wait === null || Date.now() + wait > deadline - 8000) break;
    await new Promise((r) => setTimeout(r, wait));
  }
  throw fail(502, 'views_model', last?.message || 'The model did not answer.');
}

// One search per view, junk left out; up to 5 candidates each.
async function searchViews(views, search) {
  if (!search) return views.map(() => []);
  return Promise.all(views.map(async (v) => {
    if (!v.search) return [];
    try {
      const rs = await search(v.search, { maxResults: 8, timeoutMs: 9000 });
      return rs.filter((r) => !junkReason(r)).slice(0, 5);
    } catch (e) {
      console.warn('[views] search failed:', e.message);
      return [];
    }
  }));
}

export async function mapViews({ question, presuppositions = [], force = false }, {
  now = Date.now(), llm = handleLLM, search = hasSearchKey() ? tavilySearch : null,
} = {}) {
  const q = String(question || '').trim().slice(0, 600);
  if (!q) throw fail(400, 'bad_request', 'question is required.');
  const pre = (Array.isArray(presuppositions) ? presuppositions : []).map((x) => String(x).slice(0, 200)).slice(0, 4);
  const key = `q:${hashString(`${norm(q)}|${force ? 1 : 0}`)}`;

  const cached = await hashGet(HASH, key).catch(() => null);
  if (cached) { try { return { ...JSON.parse(cached), cached: true }; } catch {} }

  const day = new Date(now).toISOString().slice(0, 10);
  const used = await hashIncr(HASH, `d:${day}`, 1, 3 * 24 * 3600).catch(() => 0);
  if (used > VIEWS_PER_DAY) throw fail(429, 'views_daily_cap', 'The views have been mapped enough times today. Try again tomorrow.');

  const deadline = now + DEADLINE_MS;
  const raw = await groqJSON({ system: VIEWS_SYSTEM, prompt: viewsPrompt({ question: q, presuppositions: pre, force }), maxTokens: 1900, deadline, llm });
  const map = normalizeViews(raw);

  if (map.status === 'divisive') {
    const results = await searchViews(map.views, search);
    map.views = map.views.map((v) => ({ ...v, piece: null }));
    if (results.some((r) => r.length) && Date.now() < deadline - 10_000) {
      try {
        const out = await groqJSON({ system: PICK_SYSTEM, prompt: pickPrompt(map.views, results), maxTokens: 500, deadline, llm });
        for (const p of Array.isArray(out?.picks) ? out.picks : []) {
          const vi = Number(p?.view) - 1, ri = Number(p?.result) - 1;
          const r = results[vi]?.[ri];
          if (!r || !map.views[vi]) continue;
          map.views[vi].piece = {
            title: String(r.title).slice(0, 200), url: r.url, source: hostOf(r.url),
            by: String(p.by || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          };
        }
      } catch (e) {
        console.warn('[views] picking pieces failed:', e.message);
      }
    }
    // Strip the search strings: they were for us, not the reader.
    map.views = map.views.map(({ search, ...v }) => v);
  }

  const out = { ...map, question: q, at: now };
  await hashUpdate(HASH, { set: { [key]: JSON.stringify(out) }, ttlSeconds: CACHE_TTL_S }).catch((e) => console.warn('[views] cache write failed:', e.message));
  return out;
}
