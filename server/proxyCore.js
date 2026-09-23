// LLM proxy core — shared by the Vercel serverless function (api/llm.js)
// and the Vite dev-server middleware (vite.config.js).
//
// Backed by Groq's free tier (console.groq.com — no card required): an
// OpenAI-compatible chat-completions API, so the request/response shape here
// is {model, messages, max_completion_tokens} in, {choices[0].message.content} out.
// The key lives only here, server-side, read from GROQ_API_KEY. The browser
// talks to /api/llm; nothing key-shaped ever ships to the client.

import { claudeComplete, claudeForced, claudeFallbackOn, claudeModel } from './claudeCli.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Only the models the demo actually uses are allowed through:
// - openai/gpt-oss-120b   — characterization, candidates, diff (plain text reasoning)
// - qwen/qwen3.8-27b      — vision, for image-artifact threads
// (groq/compound and llama-4-maverick were retired by Groq in 2026-09; web
// search now goes only through /api/search.)
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
]);

const MAX_TOKENS_CAP = 2000;

// Basic per-IP rate limiting — this is a public demo, kept well inside Groq's
// free-tier rate limits (in the tens of RPM) rather than to guard against cost.
// In-memory and per-instance, adequate for a demo deploy; swap for a shared
// store (e.g. Upstash) if traffic ever outgrows a single instance.
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_REQUESTS = 300; // personal beta: a single feed costs ~12 calls (query + select per slot, retries), so 40 locked out one real user

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    hits.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) {
    // Cheap cleanup so the map can't grow unbounded
    for (const [k, v] of hits) if (now - v.windowStart > RATE_WINDOW_MS) hits.delete(k);
  }
  return entry.count > RATE_MAX_REQUESTS;
}

export function hasKey() {
  return !!process.env.GROQ_API_KEY;
}

// Which backend answers: 'groq', or 'claude' (local `claude -p`, forced or as
// a fallback when Groq is missing/down). Reported by /api/session.
export function llmBackends() {
  return {
    primary: claudeForced() ? 'claude' : (hasKey() ? 'groq' : (claudeFallbackOn() ? 'claude' : 'none')),
    fallback: !claudeForced() && hasKey() && claudeFallbackOn() ? 'claude' : null,
    claudeModel: claudeModel(),
  };
}

async function viaClaude(messages, why) {
  try {
    console.warn(`[llm] using claude -p (${claudeModel()}) — ${why}`);
    return { status: 200, json: await claudeComplete({ messages }) };
  } catch (e) {
    console.error('[llm] claude -p failed:', e.message);
    return { status: 502, json: { error: { type: 'claude_cli_error', message: e.message } } };
  }
}

// Groq statuses that mean "Groq can't answer this right now" (not "your
// request is wrong"): auth/billing, rate limits, and server-side failures.
const GROQ_DOWN = (status) => status === 401 || status === 403 || status === 429 || status >= 500;

export async function handleLLM(body, ip) {
  if (rateLimited(ip)) {
    return {
      status: 429,
      json: { error: { type: 'rate_limited', message: 'Too many requests from this address — try again in a few minutes.' } },
    };
  }

  const { model, max_tokens, messages, reasoning_effort } = body || {};

  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return { status: 400, json: { error: { type: 'model_not_allowed', message: `Model not allowed: ${model}` } } };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, json: { error: { type: 'bad_request', message: 'messages must be a non-empty array.' } } };
  }

  if (claudeForced()) return viaClaude(messages, 'LLM_BACKEND=claude');
  if (!hasKey()) {
    if (claudeFallbackOn()) return viaClaude(messages, 'no GROQ_API_KEY');
    return {
      status: 503,
      json: { error: { type: 'no_api_key', message: 'GROQ_API_KEY is not configured on the server.' } },
    };
  }

  // Forward only the fields the demo needs — nothing else passes through.
  const forward = {
    model,
    max_completion_tokens: Math.min(Number(max_tokens) || 1000, MAX_TOKENS_CAP),
    messages,
  };
  // gpt-oss-120b spends completion tokens on its own chain-of-thought before
  // producing an answer; "low" keeps that overhead small so the tight 8K
  // TPM free-tier budget goes to the actual JSON output, not reasoning.
  if (reasoning_effort && ['openai/gpt-oss-120b'].includes(model)) {
    forward.reasoning_effort = reasoning_effort;
  }

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(forward),
    });
    const json = await res.json().catch(() => ({ error: { message: `Groq returned ${res.status} with a non-JSON body` } }));
    if (GROQ_DOWN(res.status) && claudeFallbackOn()) return viaClaude(messages, `Groq ${res.status}: ${json?.error?.message?.slice(0, 80) || ''}`);
    return { status: res.status, json };
  } catch (e) {
    console.error('[llm upstream error]', e?.name, e?.message, e?.cause?.code || e?.cause?.message || '');
    if (claudeFallbackOn()) return viaClaude(messages, `Groq unreachable: ${e.message}`);
    return { status: 502, json: { error: { type: 'upstream_error', message: e.message } } };
  }
}

// --- Web search (Tavily) — retrieve→select slot filling ---------------------
// The slot pipeline was inverted 2026-07-14: instead of asking an LLM to
// produce an item WITH a URL (which confabulates URLs — they're arbitrary
// strings, not memorable structure), a real search API returns real results
// and the LLM only SELECTS among them and writes the marginalia. The key
// lives server-side in TAVILY_API_KEY; free tier ≈ 1000 searches/month.

const TAVILY_URL = 'https://api.tavily.com/search';

export function hasSearchKey() {
  return !!process.env.TAVILY_API_KEY;
}

export async function handleSearch(body, ip) {
  if (!hasSearchKey()) {
    return {
      status: 503,
      json: { error: { type: 'no_search_key', message: 'TAVILY_API_KEY is not configured on the server.' } },
    };
  }
  if (rateLimited(ip)) {
    return {
      status: 429,
      json: { error: { type: 'rate_limited', message: 'Too many requests from this address — try again in a few minutes.' } },
    };
  }
  const query = typeof body?.query === 'string' ? body.query.slice(0, 400) : '';
  if (!query.trim()) {
    return { status: 400, json: { error: { type: 'bad_request', message: 'query is required.' } } };
  }
  const maxResults = Math.min(Math.max(Number(body?.maxResults) || 6, 1), 10);

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { status: res.status, json: { error: { type: 'search_upstream', message: data?.detail || data?.error || `Tavily error ${res.status}` } } };
    }
    // Normalize to the only fields the client needs. URLs pass through
    // VERBATIM — the whole point is that they were never model-generated.
    const results = (data.results || []).map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: (r.content || '').slice(0, 400),
    })).filter((r) => r.url);
    return { status: 200, json: { results } };
  } catch (e) {
    return { status: 502, json: { error: { type: 'search_upstream', message: e.message } } };
  }
}

// --- URL liveness check (shared by api/checkurl.js and the dev server) ------
// A feed item whose link 404s is worse than no item: the marginalia invariant
// promises the reader can inspect the source. LLM-produced URLs (especially
// from the knowledge fallback) are checked here before the item is accepted.

const CHECK_TIMEOUT_MS = 6000;

function extractYouTubeIdServer(url) {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

export async function checkUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, status: 0, reason: 'not_a_url' };
  }

  // DEADNESS REQUIRES STRONG EVIDENCE. This check runs from datacenter IPs,
  // where half the web answers with bot-wall statuses (400/401/403/406/429/
  // 5xx) for pages that open fine in a real browser. Rejecting an item costs
  // a slot; serving an unconfirmed link costs only an honest "link
  // unconfirmed" label. So: dead = HTTP 404/410 or a hard DNS/cert failure.
  // Everything else ambiguous = assumed alive, disclosed as unconfirmed.
  const DEAD_STATUSES = new Set([404, 410]);

  try {
    // YouTube: HEAD on a watch page returns 200 even for deleted videos, so
    // use oEmbed. oEmbed 404 = video gone (dead). oEmbed 401/403 = the video
    // EXISTS but disables embedding — alive, and common; never reject those.
    const ytId = extractYouTubeIdServer(url);
    if (ytId) {
      const res = await fetchWithTimeout(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ytId}`)}&format=json`
      );
      if (res.ok) return { ok: true, status: res.status, reason: 'oembed_ok' };
      if (res.status === 404) return { ok: false, status: 404, reason: 'oembed_404' };
      return { ok: true, status: res.status, reason: 'oembed_ambiguous_assumed_alive' };
    }

    // Everything else: HEAD, then a GET second opinion before any dead
    // verdict (some origins 404 HEAD requests they'd happily GET).
    const ua = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
    };
    let res = await fetchWithTimeout(url, { method: 'HEAD', headers: ua });
    if (!res.ok) {
      res = await fetchWithTimeout(url, { method: 'GET', headers: ua });
    }
    if (res.ok) return { ok: true, status: res.status, reason: 'ok' };
    if (DEAD_STATUSES.has(res.status)) {
      return { ok: false, status: res.status, reason: 'http_' + res.status };
    }
    return { ok: true, status: res.status, reason: 'bot_blocked_assumed_alive' };
  } catch (e) {
    // Network failure/timeout: DNS failure is a strong dead signal; a timeout
    // on a real site is not. Be conservative only about clearly-dead hosts.
    const msg = e?.cause?.code || e?.message || '';
    if (/ENOTFOUND|ECONNREFUSED|CERT|certificate/i.test(msg)) {
      return { ok: false, status: 0, reason: 'unreachable' };
    }
    return { ok: true, status: 0, reason: 'check_inconclusive' };
  }
}
