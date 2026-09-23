import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import fs from 'node:fs';

// Dev-server middleware: mounts the real Vercel functions in api/*.js with a
// Vercel-style req/res shim, so `npm run dev` runs exactly the prod handlers.
function apiPlugin() {
  return {
    name: 'mosaic-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const u = new URL(req.url, 'http://dev');
        const name = u.pathname.replace(/^\/+|\/+$/g, '');
        const file = resolve(__dirname, 'api', `${name}.js`);
        if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        let raw = '';
        for await (const c of req) raw += c;
        try {
          req.body = raw && (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : raw || undefined;
        } catch {
          res.statusCode = 400;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { type: 'bad_request', message: 'Invalid JSON body.' } }));
          return;
        }
        req.query = Object.fromEntries(u.searchParams);
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (obj) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
        try {
          // ssrLoadModule re-evaluates api/* and the server/* modules they import when any changes.
          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (e) {
          console.error('[api]', name, e);
          if (!res.headersSent) res.status(500).json({ error: { type: 'server_error', message: e.message } });
        }
      });
    },
  };
}

const SERVER_ENV = [
  'GROQ_API_KEY', 'TAVILY_API_KEY', 'APP_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
];

export default defineConfig(({ mode }) => {
  // Server-side secrets from .env for the dev middleware — never exposed to client code.
  // Keys set in the shell win; keys that came from .env are re-read on every
  // (auto-)restart, so editing .env takes effect without stopping the server.
  const env = loadEnv(mode, process.cwd(), '');
  const fromFile = (globalThis.__mosaicEnvFromFile ||= new Set());
  for (const k of SERVER_ENV) {
    if (process.env[k] && !fromFile.has(k)) continue; // shell-provided
    if (env[k]) { process.env[k] = env[k]; fromFile.add(k); }
    else if (fromFile.has(k)) { delete process.env[k]; fromFile.delete(k); } // removed from .env
  }
  return {
    plugins: [react(), apiPlugin()],
    server: { port: Number(process.env.PORT) || 5200 },
  };
});
