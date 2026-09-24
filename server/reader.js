// The Mosaic reader, server side: fetch a page and pull out its article
// (Mozilla Readability, the engine behind Firefox's Reader View), so it can be
// read inside Mosaic. Most sites refuse to be framed, so articles can't simply
// be shown in an iframe; video and audio use the sites' own embed players
// instead (see src/embed.js) and never come through here.
//
// The fetch runs on our server, so it is guarded: http(s) only, public
// addresses only (checked at every redirect hop), HTML only, size-capped.

import dns from 'node:dns/promises';
import net from 'node:net';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

const MAX_BYTES = 4_000_000;
const TIMEOUT_MS = 12_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

async function assertPublic(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error('Only web pages can be read here.'), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error('That link can’t be read here.'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) {
    throw Object.assign(new Error('That address can’t be read here.'), { status: 400 });
  }
}

async function fetchPage(url) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublic(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        redirect: 'manual', signal: ctrl.signal,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'en;q=0.9' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).href;
        continue;
      }
      if (res.status === 404 || res.status === 410) throw Object.assign(new Error('The page is gone.'), { status: 404, gone: true });
      if (!res.ok) throw Object.assign(new Error(`The site answered ${res.status}.`), { status: 502, blocked: true });
      const type = res.headers.get('content-type') || '';
      if (/pdf/i.test(type)) throw Object.assign(new Error('This is a PDF.'), { status: 415, pdf: true });
      if (!/html|xml/i.test(type)) throw Object.assign(new Error('This isn’t a web page Mosaic can read.'), { status: 415 });
      // Read with a size cap.
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { ctrl.abort(); break; }
        chunks.push(value);
      }
      return { url: current, html: new TextDecoder('utf-8').decode(Buffer.concat(chunks)) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(new Error('Too many redirects.'), { status: 502 });
}

// Make every link and image absolute before Readability (linkedom has no
// base-URL resolution), and wake up lazy-loaded images.
function absolutize(document, base) {
  const abs = (v) => { try { return new URL(v, base).href; } catch { return null; } };
  for (const img of document.querySelectorAll('img')) {
    const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
    if (lazy && (!img.getAttribute('src') || /^data:/.test(img.getAttribute('src')))) img.setAttribute('src', lazy);
    const src = img.getAttribute('src');
    if (src) { const a = abs(src); if (a) img.setAttribute('src', a); else img.remove(); }
    // Keep one plain src. srcset lists are dropped: CDN URLs often contain
    // commas, which makes them unsafe to rewrite.
    if (!img.getAttribute('src')) {
      const set = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
      const cands = set.split(/\s+\d+(?:\.\d+)?[wx]\s*(?:,\s*|$)/).map((x) => x.trim()).filter(Boolean);
      const a = cands.length ? abs(cands[cands.length - 1]) : null;
      if (a) img.setAttribute('src', a); else { img.remove(); continue; }
    }
    for (const attr of ['srcset', 'data-srcset', 'sizes', 'data-attrs']) img.removeAttribute(attr);
  }
  for (const s of document.querySelectorAll('source[srcset]')) s.remove();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) continue;
    const v = abs(href);
    if (v) a.setAttribute('href', v); else a.removeAttribute('href');
  }
}

// Some sites read far better from another address for the same thing.
function readableAlternatives(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const arxiv = host === 'arxiv.org' && u.pathname.match(/^\/(?:abs|pdf|html)\/([\w.\/-]+?)(?:\.pdf)?$/);
  if (arxiv) return [`https://arxiv.org/html/${arxiv[1]}`, `https://arxiv.org/abs/${arxiv[1]}`];
  if (/(^|\.)reddit\.com$/.test(host)) return [`https://old.reddit.com${u.pathname}`];
  return [url];
}

export async function readArticle(url) {
  let page, lastErr;
  for (const alt of readableAlternatives(url)) {
    try { page = await fetchPage(alt); break; } catch (e) { lastErr = e; }
  }
  if (!page) throw lastErr;
  const { document } = parseHTML(page.html);
  absolutize(document, page.url);
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content') || '';
  const art = new Readability(document, { charThreshold: 300, keepClasses: false }).parse();
  if (!art || !art.content || (art.textContent || '').trim().length < 300) {
    throw Object.assign(new Error('Couldn’t find an article on this page.'), { status: 422, empty: true });
  }
  const words = (art.textContent || '').trim().split(/\s+/).length;
  return {
    ok: true,
    url: page.url,
    title: art.title || meta('meta[property="og:title"]'),
    byline: art.byline || meta('meta[name="author"]'),
    siteName: art.siteName || meta('meta[property="og:site_name"]'),
    published: art.publishedTime || meta('meta[property="article:published_time"]'),
    html: art.content,
    words,
    minutes: Math.max(1, Math.round(words / 230)),
  };
}
