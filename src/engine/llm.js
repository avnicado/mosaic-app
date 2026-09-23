// LLM plumbing. Every call goes through the server proxy (/api/llm), which
// holds the Groq key and allowlists the models below. Pure module: no React,
// usable from the browser and from Node smoke tests (via setApiBase).

export const MODEL = 'openai/gpt-oss-120b'; // reading, search queries, selection, movement judgement
export const VISION_MODEL = 'qwen/qwen3.8-27b'; // reading an image a thread starts from

let API_BASE = ''; // '' = same origin; Node tests set e.g. 'http://localhost:5200'
let extraHeaders = {};
export function setApiBase(base, headers = {}) { API_BASE = base.replace(/\/$/, ''); extraHeaders = headers; }
export function apiFetch(path, init = {}) {
  return fetch(API_BASE + path, { ...init, headers: { ...(init.headers || {}), ...extraHeaders } });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 5-minute response cache, keyed on the normalized request -------------
const responseCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeForCache(val) {
  if (typeof val === 'string') return val.trim().toLowerCase().replace(/\s+/g, ' ');
  if (Array.isArray(val)) return val.map(normalizeForCache);
  if (val && typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val).sort()) out[k] = normalizeForCache(val[k]);
    return out;
  }
  return val;
}

const cacheKey = (body) => JSON.stringify(normalizeForCache({
  model: body.model, max_tokens: body.max_tokens, messages: body.messages, reasoning_effort: body.reasoning_effort || null,
}));

export async function callLLM({ prompt, messages = null, system = null, maxTokens = 1000, model = MODEL }) {
  // OpenAI-compatible chat-completions shape: system is a message. Callers pass
  // `messages` already in content-block shape when a thread carries an image.
  const userMessages = messages || [{ role: 'user', content: prompt }];
  const body = {
    model,
    max_tokens: maxTokens,
    messages: system ? [{ role: 'system', content: system }, ...userMessages] : userMessages,
  };
  // gpt-oss spends completion tokens on its own reasoning first; "low" keeps
  // that from eating the budget meant for the JSON answer.
  if (model === MODEL) body.reasoning_effort = 'low';

  const key = cacheKey(body);
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.text;

  const res = await apiFetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Proxy error (${res.status})`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No content in model response');
  responseCache.set(key, { text, ts: Date.now() });
  return text;
}

export function parseJSON(text) {
  let cleaned = text
    // qwen3-family models can emit a <think>…</think> trace before the answer.
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  try { return JSON.parse(cleaned); } catch {}

  const first = cleaned.search(/[{[]/);
  if (first === -1) throw new Error('No JSON found in: ' + cleaned.slice(0, 200));
  cleaned = cleaned.slice(first);
  const open = cleaned[0];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inString = false, escape = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close && --depth === 0) {
      const candidate = cleaned.slice(0, i + 1);
      try { return JSON.parse(candidate); } catch {
        const fixed = candidate
          .replace(/,(\s*[}\]])/g, '$1')
          .replace(/[“”]/g, '"')
          .replace(/[‘’]/g, "'");
        try { return JSON.parse(fixed); } catch {}
        throw new Error('Malformed JSON: ' + candidate.slice(0, 200));
      }
    }
  }
  throw new Error('Unbalanced JSON in: ' + cleaned.slice(0, 200));
}

// Parse a Groq "try again in 1m5.2s" / "in 850ms" hint into milliseconds.
export function suggestedWaitMs(msg) {
  const m = /try again in (?:(\d+)m)?([\d.]+)(ms|s)/i.exec(msg || '');
  if (!m) return null;
  return Number(m[1] || 0) * 60000 + Number(m[2]) * (m[3].toLowerCase() === 'ms' ? 1 : 1000);
}

// callLLM + parseJSON with recovery. Groq's free tier is 8K tokens/minute, so
// a 429 is routine: honor its hint. An empty or unparseable reply usually
// means the model spent the budget reasoning — retry with a bigger cap (which
// also changes the cache key, so a truncated reply isn't served again).
export async function callLLMJSON(opts, attempts = 4) {
  let maxTokens = opts.maxTokens || 1000;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    let text;
    try {
      text = await callLLM({ ...opts, maxTokens });
    } catch (e) {
      lastErr = e;
      const msg = e?.message || '';
      if (i === attempts - 1) break;
      const wait = suggestedWaitMs(msg);
      if (wait !== null) await sleep(Math.min(wait + 750, 45000));
      else if (/429|rate.?limit/i.test(msg)) await sleep(8000);
      else if (/no content in model response/i.test(msg)) maxTokens = Math.min(Math.round(maxTokens * 1.5), 2000 - i);
      else if (/5\d\d|timeout|failed to fetch|network|JSON|unexpected/i.test(msg)) await sleep(1500);
      else break; // not transient — surface it
      continue;
    }
    try { return parseJSON(text); } catch (e) {
      lastErr = e;
      maxTokens = Math.min(Math.round(maxTokens * 1.5), 2000 - i);
    }
  }
  throw lastErr;
}
