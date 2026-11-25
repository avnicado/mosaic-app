// Mosaic's service worker. It exists for two reasons:
//
//   1. The Android app (a Trusted Web Activity) must not show a Chrome
//      network error when the phone is offline. It shows /offline.html.
//   2. Once the app has been opened online, the shell and its hashed build
//      assets are cached, so a later cold start works offline. Mosaic's own
//      boot falls back to the local record when /api/session fails, so the
//      desk is usable without a connection.
//
// Rules: /api/* is never cached (it is session- and person-specific), only
// same-origin GETs are touched, and the worker never calls skipWaiting — a
// new version takes over on the next cold start, so a running page keeps the
// lazy chunks that match the index.html it was loaded from.
const VERSION = 'v1';
const SHELL = `mosaic-shell-${VERSION}`;   // offline page, index.html, icons
const ASSETS = `mosaic-assets-${VERSION}`; // hashed build output
const OFFLINE = '/offline.html';
const INDEX = '/index.html';

// Content-hashed or stable by name: safe to serve from the cache first.
const immutable = (p) => p.startsWith('/assets/') || p.startsWith('/icons/') || p === '/favicon.svg';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll([OFFLINE, '/favicon.svg', '/icons/icon-192.png'])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(ASSETS);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw e;
  }
}

// Every route is index.html (the app uses a hash router), so the shell is
// cached under one key whatever path asked for it.
async function navigation(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(INDEX, res.clone());
    return res;
  } catch {
    return (await cache.match(INDEX)) || (await cache.match(OFFLINE)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts, embeds, players
  if (url.pathname.startsWith('/api/')) return;      // never cache the API
  if (req.mode === 'navigate') { event.respondWith(navigation(req)); return; }
  if (immutable(url.pathname)) { event.respondWith(cacheFirst(req)); return; }
  event.respondWith(networkFirst(req));
});
