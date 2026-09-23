// Vercel serverless function: POST /api/llm
// Forwards {model, max_tokens, messages} to Groq's free-tier API with the
// server-side key. See server/proxyCore.js for allowlisting and rate limiting.

import { handleLLM } from '../server/proxyCore.js';
import { requireAuth } from '../server/auth.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: { type: 'method_not_allowed', message: 'POST only' } });
    return;
  }
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const { status, json } = await handleLLM(req.body, ip);
  res.status(status).json(json);
}
