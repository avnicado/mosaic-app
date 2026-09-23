// Local-only LLM backend: runs a chat request through the Claude Code CLI
// (`claude -p`) with Sonnet. Used when Groq is down, rate-limited, or not
// configured — on your own machine only. On Vercel there is no `claude`
// binary (and process.env.VERCEL is set), so this is never enabled there.
//
// Env:
//   LLM_BACKEND=claude        always use Claude (skip Groq)
//   LLM_FALLBACK=off          never fall back to Claude
//   CLAUDE_MODEL=sonnet       model alias or full id passed to --model
//   CLAUDE_BIN=claude         path to the CLI

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 180000;
const BIN = () => process.env.CLAUDE_BIN || 'claude';
export const claudeModel = () => process.env.CLAUDE_MODEL || 'sonnet';

let available = null;
export function claudeAvailable() {
  if (process.env.VERCEL) return false;
  if (available === null) {
    try { available = spawnSync(BIN(), ['--version'], { timeout: 10000 }).status === 0; } catch { available = false; }
  }
  return available;
}
export const claudeForced = () => process.env.LLM_BACKEND === 'claude' && claudeAvailable();
export const claudeFallbackOn = () => process.env.LLM_FALLBACK !== 'off' && claudeAvailable();

const textOf = (content) => (typeof content === 'string'
  ? content
  : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));

// OpenAI-style {messages} → Groq/OpenAI-style completion JSON.
export async function claudeComplete({ messages }) {
  const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
  const convo = messages.filter((m) => m.role !== 'system');

  // Images arrive as data: URLs; write them to a temp dir the CLI may Read.
  let dir = null;
  const imagePaths = [];
  for (const m of convo) {
    for (const b of Array.isArray(m.content) ? m.content : []) {
      const url = b?.image_url?.url || '';
      const match = /^data:image\/(\w+);base64,(.+)$/.exec(url);
      if (!match) continue;
      dir = dir || await fs.mkdtemp(path.join(os.tmpdir(), 'mosaic-img-'));
      const file = path.join(dir, `image-${imagePaths.length + 1}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`);
      await fs.writeFile(file, Buffer.from(match[2], 'base64'));
      imagePaths.push(file);
    }
  }

  let prompt = convo.length === 1
    ? textOf(convo[0].content)
    : convo.map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${textOf(m.content)}`).join('\n\n');
  if (imagePaths.length) {
    prompt = `First read the image file${imagePaths.length > 1 ? 's' : ''} at ${imagePaths.join(', ')} with the Read tool, then answer.\n\n${prompt}`;
  }

  const args = [
    '-p', '--model', claudeModel(), '--output-format', 'json',
    '--no-session-persistence', '--strict-mcp-config',
    '--tools', imagePaths.length ? 'Read' : '',
    '--system-prompt', (system || 'You are a precise assistant.') + '\n\nAnswer directly. When asked for JSON, output only the JSON.',
  ];
  if (dir) args.push('--add-dir', dir, '--allowedTools', 'Read');

  try {
    const out = await new Promise((resolve, reject) => {
      const child = spawn(BIN(), args, { cwd: dir || os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude -p timed out')); }, TIMEOUT_MS);
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout) reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 300)}`));
        else resolve(stdout);
      });
      child.stdin.end(prompt);
    });
    let parsed;
    try { parsed = JSON.parse(out); } catch { throw new Error('claude -p returned non-JSON output: ' + out.slice(0, 200)); }
    if (parsed.is_error) throw new Error('claude -p error: ' + String(parsed.result || parsed.subtype || 'unknown').slice(0, 300));
    return {
      id: 'claude-' + (parsed.session_id || Date.now()),
      object: 'chat.completion',
      model: `claude-cli:${claudeModel()}`,
      backend: 'claude',
      choices: [{ index: 0, message: { role: 'assistant', content: String(parsed.result || '') }, finish_reason: 'stop' }],
    };
  } finally {
    if (dir) fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
