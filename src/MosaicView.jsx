import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Only the earth it is laid on and the moss that takes a neglected panel —
// deliberately NOT courtyardAssets.js, so the mosaic chunk stays light.
import { CM_GROUND_DEFS, CM_MOSSMAT_DEFS } from './groundAssets.js';
import { sessionItems, currentArticulation, isDormant } from './data/record.js';

// ============================================================
// THE MOSAIC — a literal mosaic of your own record
// ============================================================
// Built live from the threads and sessions in this browser's record, by
// profileFromRecord() below. Flat stone pieces cut to fit each other, grouped
// into one panel per thread.
//
//   panel      — one thread (a spawned thread is its own question, so it gets
//                its own panel, colour and click target). A thread with no
//                finished session yet is a dashed, staked-out plot.
//   a piece    — one FINISHED session (closedAt set; an open session cuts
//                nothing yet). Only a session whose diff.verdict is 'real' is
//                LAID in colour, at the panel's core. Cosmetic sessions are
//                uncoloured parchment pieces; unjudged ones (ended without a
//                restatement) fainter still, with a dashed cut.
//   size       — for a laid piece, the number of that session's items
//                (sessionItems) you marked ✦ moved ('moved').
//   brightness — the thread's real share of its judged sessions,
//                real / (real + cosmetic).
//   hue        — the thread's own, stable colour
//   moss       — a quiet thread (isDormant: active, untouched for 30 days)
//   brass edge — a closed thread (settled), with an italic caption
//
// THE HONESTY RULE: colour is laid ONLY for a session whose movement was
// judged real. Activity alone — sessions opened, items read — cuts an
// uncoloured piece and colours nothing.
// Everything is deterministic: the same record lays the same mosaic.
// ============================================================

// Hue source for thread colours (same family as the rest of the app's palette).
const PALETTE = ['#7ec8ff', '#ffb37e', '#9be89b', '#e0a6ff', '#ffe38a', '#8ae8d8', '#ff9ec6', '#d8e88a'];
const DORMANT_AFTER_DAYS = 30;

const VB_W = 1000;
const VB_H = 420;
const FOCAL = { x: 500, y: 208 };
const Y_SQUASH = 0.80;
const GROUT = 1.5;

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v) => clamp(v, 0, 1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---- colour: hue carries the subject, lightness carries shallow vs deep ----

const hexToHue = (hex) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return (hue * 60 + 360) % 360;
};

// A shallow subject reads pastel and chalky; a deep one reads as dark, saturated
// royal glass. `t` is the subject's real-vs-cosmetic share, normalised.
// Royal, not fluorescent: saturation is held well below full so a deep subject
// reads as dark jewel-stone rather than a screen colour.
// No two tesserae come off the same block. The subject's tone is the mean; each
// piece is cut a little lighter or darker, a little warmer or cooler, around it
// — that scatter is what stops a panel reading as one flat shape.
const tessera = (hue, t, jitter, hueJit = 0, sparkle = 0) => {
  const h = (hue + hueJit * 9 + 360) % 360;
  // Yellow-greens read far brighter than blues at equal saturation, so they get
  // held back — otherwise a deep green subject goes fluorescent while a deep
  // blue one stays a jewel.
  const warmth = Math.exp(-(((h - 100) / 58) ** 2));
  // Deep panels carry the wider spread: dark jewel tone with the odd piece
  // catching the light is far more alive than an even field of one colour.
  const spread = 7 + t * 9;
  const sat = clamp((20 + t * 46 + jitter * 13) * (1 - 0.3 * warmth), 10, 78);
  const light = clamp(
    86 - t * 60 + jitter * spread + sparkle * (6 + t * 12) - 9 * warmth * t,
    14, 94,
  );
  return `hsl(${h.toFixed(0)} ${sat.toFixed(0)}% ${light.toFixed(0)}%)`;
};

// ---- geometry: real Voronoi cells, so the pieces actually fit together ----

const polyCentroid = (poly) => {
  let x = 0, y = 0;
  poly.forEach((p) => { x += p[0]; y += p[1]; });
  return [x / poly.length, y / poly.length];
};

// Sutherland–Hodgman against one half-plane: keep what lies on the near side of
// the bisector between two seeds. Clipping by every other seed leaves the cell.
const clipHalfPlane = (poly, mid, n) => {
  const out = [];
  const side = (p) => (p[0] - mid[0]) * n[0] + (p[1] - mid[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) {
      const tt = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt]);
    }
  }
  return out;
};

const voronoiCell = (site, others, region) => {
  let cell = region;
  for (let j = 0; j < others.length && cell.length > 2; j++) {
    const o = others[j];
    if (o === site) continue;
    const mid = [(site[0] + o[0]) / 2, (site[1] + o[1]) / 2];
    cell = clipHalfPlane(cell, mid, [o[0] - site[0], o[1] - site[1]]);
  }
  return cell;
};

// Pull every edge in toward the middle to open the grout lines between pieces.
const inset = (poly, amount) => {
  const c = polyCentroid(poly);
  return poly.map((p) => {
    const dx = p[0] - c[0], dy = p[1] - c[1];
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, 1 - amount / d);
    return [c[0] + dx * k, c[1] + dy * k];
  });
};

const pathOf = (poly) =>
  poly.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';


// ============================================================
// record -> mosaic profile
// ============================================================

// FNV-1a: a stable 32-bit hash, so a thread keeps its colour and its pieces'
// cut from visit to visit.
const hashStr = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// v2 record. A session is a piece only once it has closed; an open session is
// still being walked and cuts nothing yet.
export function profileFromRecord(threads = [], sessions = [], now = Date.now(), itemsOf = sessionItems) {
  const byThread = {};
  for (const s of sessions) {
    if (!s || !s.threadId || !s.closedAt) continue;
    (byThread[s.threadId] = byThread[s.threadId] || []).push(s);
  }
  // Oldest thread first: colours are handed out in that order, so an existing
  // thread's colour never changes when a new thread arrives. Every thread gets
  // a panel, even one with no finished session yet (a staked-out plot).
  const ordered = threads
    .filter((t) => t && t.id)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const taken = new Set();
  const domains = ordered.map((t) => {
    const ss = [...(byThread[t.id] || [])].sort((a, b) => (a.openedAt || 0) - (b.openedAt || 0));
    const verdict = (s) => s.diff?.verdict;
    const real = ss.filter((s) => verdict(s) === 'real');
    const cosmetic = ss.filter((s) => verdict(s) === 'cosmetic').length;
    const depth = real.length + cosmetic ? real.length / (real.length + cosmetic) : 0.5;
    let slot = hashStr(t.id) % PALETTE.length;
    if (taken.size < PALETTE.length) {
      while (taken.has(slot)) slot = (slot + 1) % PALETTE.length;
    }
    taken.add(slot);
    return {
      threadId: t.id,
      name: currentArticulation(t) || 'Untitled thread',
      consumed: real.length,
      cosmetic,
      // Every finished session, oldest first: its verdict, and how many of its
      // items moved you (the size of a laid piece).
      cuts: ss.map((s) => ({
        kind: verdict(s) === 'real' ? 'real' : verdict(s) === 'cosmetic' ? 'cosmetic' : 'unjudged',
        w: itemsOf(s).filter((i) => i.signal === 'moved').length,
      })),
      depth,
      dormant: isDormant(t, now),
      closed: t.status === 'closed',
      color: PALETTE[slot],
      seed: hashStr(t.id) || 1,
      sessions: ss.length,
    };
  });

  const seed = hashStr(ordered.map((t) => t.id).join('|') || 'mosaic') % 99991;
  return { seed: seed || 1337, domains };
}

// ============================================================

// A piece's radius from its weight (items marked "moved me"). Capped so one
// very full session can't swallow its panel.
const pieceR = (w) => 12 + 4 * Math.min(5, Math.max(0, w || 0));
const BARE_R = 30;

// Two short lines, broken at words, the second ending in … if it runs over.
const LABEL_LINE = 30;
const wrapLabel = (text) => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + ' ' + w).length <= LABEL_LINE) lines[lines.length - 1] = cur + ' ' + w;
    else if (lines.length < 2) lines.push(w);
    else { lines[1] += ' ' + w; break; }
  }
  return lines.filter(Boolean).map((l) => (l.length > LABEL_LINE ? `${l.slice(0, LABEL_LINE - 1).trimEnd()}…` : l))
    .map((l, i, arr) => (i === 1 && words.join(' ').length > arr.join(' ').length && !l.endsWith('…') ? `${l}…` : l));
};

export function buildMosaic(profile) {
  const rand = mulberry32(((profile.seed || 1) * 2654435761) >>> 0);
  const domains = profile.domains || [];

  // 1. one panel per thread; one piece per session — laid in colour only where
  //    the session really moved the question, otherwise cut but left uncoloured
  const panels = domains.map((d, idx) => {
    const depth = clamp01(d.depth == null ? 0.5 : d.depth);
    const t = depth;
    const n = Math.max(0, Math.round(d.consumed || 0));
    const pr = mulberry32(((d.seed || ((profile.seed || 1) + idx * 7919)) * 2246822519) >>> 0);

    // The laid pieces carry their real sizes. The field is cut wider than the
    // work actually laid: the remainder is never drawn, but it is what the
    // outermost laid pieces were cut against, so their edges still fit.
    const mkPiece = (r, kind) => ({
      r, kind,
      jitter: pr() * 2 - 1,
      hueJit: pr() * 2 - 1,
      // a scarce few pieces catch the light
      sparkle: pr() > 0.86 ? pr() : 0,
    });
    const cuts = Array.isArray(d.cuts) ? d.cuts : Array.from({ length: n }, () => ({ kind: 'real', w: 0 }));
    // Real pieces first (they form the core), then the others in order.
    const cut = [
      ...cuts.filter((c) => c.kind === 'real').map((c) => mkPiece(pieceR(c.w), 'real')),
      ...cuts.filter((c) => c.kind !== 'real').map((c) => mkPiece(pieceR(0), c.kind)),
    ];
    const total = cut.length;
    const rest = [];
    const extra = total ? Math.max(7, Math.round(total * 1.1)) : 0;
    for (let i = 0; i < extra; i++) {
      const u = pr();
      rest.push(mkPiece(12 + u * u * 16, 'field'));
    }
    const laidArea = cut.reduce((s, p) => s + p.r * p.r, 0);
    const fieldArea = laidArea + rest.reduce((s, p) => s + p.r * p.r, 0);
    const fieldRadius = total ? Math.sqrt(Math.max(fieldArea, 24) / 0.62) + 8 : BARE_R;
    const radius = total
      ? Math.max(Math.sqrt(Math.max(laidArea, 24) / 0.62) + 8, fieldRadius * 0.8)
      : BARE_R;
    // Smooth lobed outline — a laid panel has an organic edge, not a perfect oval.
    const wob = [pr() * 6.283, pr() * 6.283, pr() * 6.283];

    return {
      idx, d, depth, t, n, cut, rest, radius, fieldRadius, wob, pr,
      hue: hexToHue(d.color || '#8a7f70'),
      dormant: !!d.dormant,
      bare: total === 0,
    };
  });

  // A small record is laid larger, a big one smaller, so the floor is always
  // read at a sensible scale. Every piece scales alike — relative size, the
  // part that carries meaning, is untouched.
  const footprint = panels.reduce((s, p) => s + Math.PI * p.radius * p.radius * Y_SQUASH, 0);
  const S = footprint ? clamp(Math.sqrt((0.13 * VB_W * VB_H) / footprint), 0.5, 2.3) : 1;
  panels.forEach((p) => {
    p.cut.forEach((pc) => { pc.r *= S; });
    p.rest.forEach((pc) => { pc.r *= S; });
    p.radius *= S;
    p.fieldRadius *= S;
    // captions wrap to two short lines under their own panel
    p.lines = wrapLabel((p.d.name || '').trim());
    p.labelW = Math.max(0, ...p.lines.map((l) => l.length)) * 6.15;
  });

  // 2. place the panels apart from each other
  const order = [...panels].sort((a, b) => (b.n ? 1 : 0) - (a.n ? 1 : 0) || b.t - a.t || b.cut.length - a.cut.length);
  const seedAngle = rand() * Math.PI * 2;
  order.forEach((p, i) => {
    const spread = panels.length === 1 ? 0 : (0.34 + (1 - p.t) * 0.9);
    const r = spread * 250 * (0.62 + 0.3 * rand());
    const ang = seedAngle + i * 2.399963 + (rand() - 0.5) * 0.5;
    p.cx = FOCAL.x + Math.cos(ang) * r;
    p.cy = FOCAL.y + Math.sin(ang) * r * Y_SQUASH;
  });
  for (let iter = 0; iter < 90; iter++) {
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const a = panels[i], b = panels[j];
        let dx = b.cx - a.cx, dy = (b.cy - a.cy) / Y_SQUASH;
        const dist = Math.hypot(dx, dy) || 0.01;
        // room between them for a caption
        const minD = (a.radius + b.radius) * 1.08 + 44;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          dx /= dist; dy /= dist;
          a.cx -= dx * push; a.cy -= dy * push * Y_SQUASH;
          b.cx += dx * push; b.cy += dy * push * Y_SQUASH;
        }
      }
    }
    panels.forEach((p) => {
      p.cx = clamp(p.cx, p.radius + 30, VB_W - p.radius - 30);
      p.cy = clamp(p.cy, p.radius * Y_SQUASH + 24, VB_H - p.radius * Y_SQUASH - 50);
    });
  }
  if (panels.length) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    panels.forEach((p) => {
      minX = Math.min(minX, p.cx - p.radius); maxX = Math.max(maxX, p.cx + p.radius);
      minY = Math.min(minY, p.cy - p.radius * Y_SQUASH);
      maxY = Math.max(maxY, p.cy + p.radius * Y_SQUASH);
    });
    const dx = (VB_W - (minX + maxX)) / 2;
    const dy = (VB_H - 24 - (minY + maxY)) / 2;
    panels.forEach((p) => { p.cx += dx; p.cy += dy; });
  }

  // 3. cut the tesserae
  const beds = [];
  const tiles = [];
  const mossEls = [];
  const labels = [];

  panels.forEach((p) => {
    const { pr } = p;
    const tid = esc(p.d.threadId || '');
    const full = esc((p.d.name || '').trim());
    const open = `<g class="ms-panel" data-thread="${tid}">`;

    // The field's own outline, a slightly irregular bed.
    const VN = 30;
    const region = [];
    const [w1, w2, w3] = p.wob;
    for (let i = 0; i < VN; i++) {
      const a = (i / VN) * Math.PI * 2;
      const lobe = 1 + 0.11 * Math.sin(2 * a + w1) + 0.07 * Math.sin(3 * a + w2)
        + 0.045 * Math.sin(5 * a + w3);
      const rr = p.fieldRadius * lobe;
      region.push([p.cx + Math.cos(a) * rr, p.cy + Math.sin(a) * rr * Y_SQUASH]);
    }

    let bottom = p.cy + p.radius * Y_SQUASH;
    let topEdge = p.cy - p.radius * Y_SQUASH;

    if (p.bare) {
      // Bare ground: sessions walked, none judged real yet. A staked-out plot.
      beds.push(
        open + `<title>${full} — no finished session yet</title>` +
        `<path d="${pathOf(region)}" style="fill:rgba(52,42,30,0.10);stroke:var(${p.d.closed ? '--gold' : '--ink-faded'});stroke-width:1.1;opacity:0.85" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>` +
        `</g>`
      );
    } else {
      // Pieces grown outward from the middle one at a time, each set against a
      // piece already cut — so the frontier is the shape of how far the work
      // got. The first real session sits at the heart, the other real ones
      // around it, and the sessions that didn't move the question outside.
      const sites = [];
      const fits = (x, y, r) => sites.every((s) => {
        const dx = x - s[0], dy = (y - s[1]) / Y_SQUASH;
        return Math.hypot(dx, dy) > (r + s.r) * 0.82;
      });
      const inField = (x, y, r) =>
        Math.hypot(x - p.cx, (y - p.cy) / Y_SQUASH) < p.fieldRadius * 0.94 - r * 0.3;
      p.cut.forEach((piece, k) => {
        let pick = null;
        if (k === 0) {
          pick = [p.cx, p.cy];
        } else {
          const cands = [];
          let fallback = null;
          for (let attempt = 0; attempt < 240 && cands.length < 14; attempt++) {
            const anchor = sites[Math.floor(pr() * sites.length)];
            const a = pr() * Math.PI * 2;
            const dist = (anchor.r + piece.r) * (0.86 + pr() * 0.22);
            const x = anchor[0] + Math.cos(a) * dist;
            const y = anchor[1] + Math.sin(a) * dist * Y_SQUASH;
            fallback = [x, y];
            if (fits(x, y, piece.r) && inField(x, y, piece.r)) cands.push([x, y]);
          }
          if (cands.length) {
            // Mostly the ones nearest the heart, loosely — a tidy circle would
            // look drawn around, not laid.
            cands.sort((u, v) => Math.hypot(u[0] - p.cx, (u[1] - p.cy) / Y_SQUASH)
              - Math.hypot(v[0] - p.cx, (v[1] - p.cy) / Y_SQUASH));
            pick = cands[Math.min(cands.length - 1, Math.floor(pr() * pr() * 4))];
          } else {
            pick = fallback;
          }
        }
        pick.r = piece.r; pick.piece = piece;
        sites.push(pick);
      });
      const laid = new Set(sites);

      // Then the unlaid remainder of the field, largest first.
      [...p.rest].sort((a, b) => b.r - a.r).forEach((piece) => {
        for (let attempt = 0; attempt < 220; attempt++) {
          const a = pr() * Math.PI * 2;
          const rr = p.fieldRadius * 0.94 * Math.sqrt(pr());
          const x = p.cx + Math.cos(a) * rr;
          const y = p.cy + Math.sin(a) * rr * Y_SQUASH;
          if (fits(x, y, piece.r) || attempt === 219) {
            const site = [x, y];
            site.r = piece.r; site.piece = piece;
            sites.push(site);
            break;
          }
        }
      });

      const cells = [];
      sites.forEach((site) => {
        if (!laid.has(site)) return;
        const cell = voronoiCell(site, sites, region);
        if (cell.length >= 3) cells.push({ site, cell });
      });

      // The mortar bed is the union of the laid pieces, so the panel's
      // silhouette is whatever was actually laid — never a shape drawn around it.
      // A closed thread is settled: a thin brass edge along the outside of
      // what was laid (drawn under an opaque bed, so only its outer half shows).
      const cellPaths = cells.map(({ cell }) => `<path d="${pathOf(cell)}"/>`).join('');
      beds.push(
        open +
        `<g fill="rgba(44,32,18,0.20)" transform="translate(2.5 3.5)">` + cellPaths + `</g>` +
        (p.d.closed
          ? `<g style="fill:var(--gold);stroke:var(--gold);stroke-width:3.4;stroke-linejoin:round">` + cellPaths + `</g>` +
            `<g fill="rgb(160,148,130)">` + cellPaths + `</g>`
          : `<g fill="rgba(52,42,30,0.46)">` + cellPaths + `</g>`) +
        `</g>`
      );

      const faces = [];
      cells.forEach(({ site, cell }) => {
        const face = inset(cell, GROUT);
        if (face.length < 3) return;
        if (site.piece.kind === 'cosmetic') {
          // Cut, not laid: plain parchment, grout-outlined.
          faces.push(
            `<path d="${pathOf(face)}" fill="hsl(40 36% ${(90 + site.piece.jitter * 2).toFixed(0)}%)" stroke="rgba(30,22,12,0.42)" stroke-width="0.8" stroke-linejoin="round"/>` +
            `<path d="${pathOf(inset(face, 1.2))}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.8" stroke-linejoin="round"/>`
          );
          return;
        }
        if (site.piece.kind === 'unjudged') {
          // Not judged yet: fainter still, and a dashed cut.
          faces.push(
            `<path d="${pathOf(face)}" fill="hsl(40 24% 95.5%)" stroke="rgba(30,22,12,0.38)" stroke-width="0.8" stroke-dasharray="2.5 2.5" stroke-linejoin="round"/>`
          );
          return;
        }
        const fill = tessera(p.hue, p.t, site.piece.jitter, site.piece.hueJit, site.piece.sparkle);
        // A cut stone catches the light on its upper-left edge and drops a
        // little shade on the lower-right; two thin strokes read as bevel.
        faces.push(
          `<path d="${pathOf(face)}" fill="${fill}" stroke="rgba(30,22,12,0.5)" stroke-width="0.7" stroke-linejoin="round"/>` +
          `<path d="${pathOf(inset(face, 1.2))}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="0.9" stroke-linejoin="round"/>`
        );
      });
      tiles.push(open + `<title>${full}</title>` + faces.join('') + `</g>`);

      // Moss takes a thread left alone. Clipped to the panel: it grows on the
      // tiles and stops at their edge, rather than spilling onto bare ground.
      if (p.dormant) {
        const clipId = `cm-clip-panel-${p.idx}`;
        const mats = [];
        const tufts = 2 + Math.floor(pr() * 2);
        for (let i = 0; i < tufts; i++) {
          const m = 1 + Math.floor(pr() * 6);
          const a = (i / tufts) * Math.PI * 2 + pr() * 1.4;
          // Small panels (one or two pieces) need the mats nearer the middle
          // and larger, or the moss only catches the corners.
          const small = cells.length <= 3;
          const rr = p.radius * (small ? 0.05 + pr() * 0.3 : 0.3 + pr() * 0.55);
          const ms = p.radius * (small ? 1.7 + pr() * 0.6 : 1.0 + pr() * 0.5);
          const mx = p.cx + Math.cos(a) * rr;
          const my = p.cy + Math.sin(a) * rr * Y_SQUASH;
          mats.push(
            `<use href="#cm-mossmat-${m}" x="${(mx - ms / 2).toFixed(1)}" y="${(my - ms / 2).toFixed(1)}" width="${ms.toFixed(1)}" height="${ms.toFixed(1)}" opacity="0.85"/>`
          );
        }
        mossEls.push(
          `<clipPath id="${clipId}">` +
          cells.map(({ cell }) => `<path d="${pathOf(cell)}"/>`).join('') +
          `</clipPath>` +
          open + `<g clip-path="url(#${clipId})">${mats.join('')}</g></g>`
        );
      }

      // Sit under the work actually laid — its real reach is what the
      // caption has to clear.
      cells.forEach(({ cell }) => cell.forEach((pt) => {
        if (pt[1] > bottom) bottom = pt[1];
        if (pt[1] < topEdge) topEdge = pt[1];
      }));
    }

    if (p.lines.length) {
      // Under its own panel; above it if another panel sits in the way.
      const h = p.lines.length * 13;
      const halfW = p.labelW / 2;
      const top = topEdge;
      const blocked = (y0) => panels.some((o) => o !== p &&
        Math.abs(p.cx - o.cx) < o.radius + halfW + 6 &&
        y0 + h > o.cy - o.radius * Y_SQUASH - 4 && y0 < o.cy + o.radius * Y_SQUASH + 4);
      let y0 = bottom + 6;
      if (blocked(y0) && !blocked(top - 6 - h)) y0 = top - 6 - h;
      labels.push({
        x: p.cx, y0, h, w: p.labelW, lines: p.lines, full, tid,
        faded: p.dormant || !p.n, closed: !!p.d.closed, from: bottom + 3, orig: y0, ax: p.cx,
      });
    }
  });

  // Captions never sit on each other: push overlapping boxes apart along
  // whichever axis they overlap least, half each, until they clear.
  const clampLabel = (l) => {
    l.x = clamp(l.x, l.w / 2 + 12, VB_W - l.w / 2 - 12);
    l.y0 = clamp(l.y0, 6, VB_H - l.h - 6);
  };
  labels.forEach(clampLabel);
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const A = labels[i], B = labels[j];
        const dx = B.x - A.x;
        const dy = (B.y0 + B.h / 2) - (A.y0 + A.h / 2);
        const ox = (A.w + B.w) / 2 + 10 - Math.abs(dx);
        const oy = (A.h + B.h) / 2 + 3 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy <= ox) {
          const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 0.5);
          A.y0 -= s; B.y0 += s;
        } else {
          const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 0.5);
          A.x -= s; B.x += s;
        }
        clampLabel(A); clampLabel(B);
      }
    }
    if (!moved) break;
  }
  const labelEls = labels.map((l) => {
    const x = l.x, y0 = l.y0;
    const leader = Math.abs(y0 - l.orig) > 14 && y0 > l.from
      ? `<line x1="${l.ax.toFixed(1)}" y1="${l.from.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y0 + 1).toFixed(1)}" style="stroke:var(--ink-faded);stroke-width:0.9;opacity:0.5" stroke-dasharray="2 3"/>`
      : '';
    const spans = l.lines.map((line, i) =>
      `<tspan x="${x.toFixed(1)}" y="${(y0 + 10 + i * 13).toFixed(1)}">${esc(line)}</tspan>`).join('');
    return leader + `<text class="ms-panel" data-thread="${l.tid}" text-anchor="middle" ` +
      `style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;` +
      `fill:var(${l.faded ? '--ink-faded' : '--ink-soft'});stroke:var(--bg);stroke-width:3.2;` +
      `paint-order:stroke;letter-spacing:0.01em${l.closed ? ';font-style:italic' : ''}"><title>${l.full}${l.closed ? ' (closed)' : ''}</title>${spans}</text>`;
  });

  return `<svg class="ms-svg" viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">` +
    CM_GROUND_DEFS +
    CM_MOSSMAT_DEFS +
    `<use href="#cm-ground"/>` +
    beds.join('') +
    tiles.join('') +
    mossEls.join('') +
    labelEls.join('') +
    `</svg>`;
}

const swatchTile = (hue, t) => {
  const pts = [[6, 15], [17, 6], [30, 9], [33, 24], [21, 31], [8, 26]];
  return `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
    `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('')}Z" ` +
    `fill="${tessera(hue, t, 0)}" stroke="rgba(38,30,20,0.42)" stroke-width="0.9" stroke-linejoin="round"/></svg>`;
};

const LEGEND = [
  {
    key: 'pale',
    swatch: swatchTile(212, 0.15),
    label: 'Pale colour',
    body: 'a thread whose judged sessions were mostly rewording. Tone is its real share: real ÷ (real + cosmetic).',
  },
  {
    key: 'deep',
    swatch: swatchTile(268, 1),
    label: 'Dark, saturated colour',
    body: 'a thread where most judged sessions really moved the question.',
  },
  {
    key: 'big',
    swatch: `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
      `<path d="M4,20 L12,6 L26,4 L34,17 L27,32 L10,31 Z" fill="hsl(150 34% 62%)" stroke="rgba(38,30,20,0.42)" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<path d="M20,19 L26,12 L33,17 L28,27 Z" fill="hsl(150 30% 44%)" stroke="rgba(38,30,20,0.42)" stroke-width="0.8" stroke-linejoin="round"/></svg>`,
    label: 'Size of a coloured piece',
    body: 'how many items in that session you marked ✦ moved me.',
  },
  {
    key: 'outline',
    swatch: `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
      `<path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill="hsl(40 36% 90%)" stroke="rgba(38,30,20,0.45)" stroke-width="1" stroke-linejoin="round"/></svg>`,
    label: 'An uncoloured piece',
    body: 'a session judged cosmetic: the question was reworded, not moved.',
  },
  {
    key: 'unjudged',
    swatch: `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
      `<path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill="hsl(40 24% 95.5%)" stroke="rgba(38,30,20,0.45)" stroke-width="1" stroke-dasharray="2.5 2.5" stroke-linejoin="round"/></svg>`,
    label: 'A dashed, uncoloured piece',
    body: 'a session that ended without a restatement, so nothing was judged.',
  },
  {
    key: 'bare',
    swatch: `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
      `<ellipse cx="19" cy="19" rx="15" ry="12" fill="rgba(52,42,30,0.10)" stroke="#8a7f72" stroke-width="1.1" stroke-dasharray="3 3"/></svg>`,
    label: 'A dashed outline',
    body: 'a thread with no finished session yet.',
  },
  {
    key: 'closed',
    swatch: `<svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">` +
      `<path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill="hsl(268 40% 40%)" stroke="#b8923a" stroke-width="2.2" stroke-linejoin="round"/></svg>`,
    label: 'A brass edge, italic name',
    body: 'a thread you closed with a synthesis.',
  },
  {
    key: 'moss',
    swatch: `<svg viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><use href="#cm-mossmat-4"/></svg>`,
    label: 'Moss',
    body: `a thread with no activity in ${DORMANT_AFTER_DAYS} days. Data, not failure.`,
  },
];

export default function MosaicView({ threads = [], sessions = [], onOpenThread, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef(null);

  const profile = useMemo(() => profileFromRecord(threads, sessions), [threads, sessions]);
  const cuts = profile.domains.flatMap((d) => d.cuts || []);
  const count = (k) => cuts.filter((c) => c.kind === k).length;
  const real = count('real'), cosmetic = count('cosmetic'), unjudged = count('unjudged');
  const present = {
    pale: profile.domains.some((d) => d.consumed && d.depth < 0.6),
    deep: profile.domains.some((d) => d.consumed && d.depth >= 0.6),
    big: real > 0,
    outline: cosmetic > 0,
    unjudged: unjudged > 0,
    bare: profile.domains.some((d) => !d.sessions),
    closed: profile.domains.some((d) => d.closed),
    moss: profile.domains.some((d) => d.dormant),
  };

  const svg = useMemo(() => (profile.domains.length ? buildMosaic(profile) : ''), [profile]);

  const toggleExpanded = useCallback(() => {
    const node = rootRef.current;
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
    if (!expanded && node?.requestFullscreen) {
      node.requestFullscreen().catch(() => setExpanded(true));
      return;
    }
    setExpanded((v) => !v);
  }, [expanded]);

  useEffect(() => {
    const onChange = () => setExpanded(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const onCanvasClick = useCallback((e) => {
    const el = e.target.closest && e.target.closest('[data-thread]');
    const id = el && el.getAttribute('data-thread');
    if (!id || !onOpenThread) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    setExpanded(false);
    onOpenThread(id);
  }, [onOpenThread]);

  const legend = LEGEND.filter((item) => present[item.key]);

  return (
    <div className={`ms-exhibit${expanded ? ' ms-expanded' : ''}${onOpenThread ? ' ms-clickable' : ''}`} ref={rootRef}>
      <style>{mosaicStyles}</style>

      {!compact && (
        <div className="ms-head">
          <h3>Your mosaic</h3>
          {cuts.length > 0 && (
            <span className="ms-count">
              {cuts.length} finished {cuts.length === 1 ? 'session' : 'sessions'}: {real} real · {cosmetic} cosmetic · {unjudged} not judged
            </span>
          )}
        </div>
      )}

      {real === 0 && (
        <div className="ms-empty">
          Colour appears only where a session really moved a question. None has yet
          {cuts.length > 0 ? '; the uncoloured pieces are sessions you finished.' : '.'}
        </div>
      )}

      {svg && (
        <div className="ms-canvas-wrap">
          <div
            className="ms-canvas"
            onClick={onCanvasClick}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <button
            type="button"
            className="ms-expand-btn"
            onClick={toggleExpanded}
            aria-pressed={expanded}
            title={expanded ? 'Close (Esc)' : 'Expand the mosaic'}
          >
            {expanded ? 'Close ✕' : 'Expand ⤢'}
          </button>
        </div>
      )}

      {svg && (
        <>
          <div className="ms-legend">
            {legend.map((item) => (
              <div className="ms-legend-row" key={item.key}>
                <span className="ms-swatch" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.swatch }} />
                <span className="ms-legend-text"><strong>{item.label}</strong>: {item.body}</span>
              </div>
            ))}
          </div>
          <div className="ms-key">
            One panel per thread, named by where its question is now; one piece per finished
            session. Only a session judged real is laid in colour. Rewording, and time alone,
            colour nothing.
            {onOpenThread && ' Click a panel to open that thread.'}
          </div>
        </>
      )}
    </div>
  );
}

const mosaicStyles = `
.ms-exhibit { margin: 4px 0 30px; }
.ms-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.ms-head h3 { font-family: 'Fraunces', Georgia, serif; font-size: 25px; font-weight: 600; margin: 0; color: var(--ink); }
.ms-count { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink-faded); }
.ms-empty { margin-top: 10px; font-family: 'Fraunces', Georgia, serif; font-size: 17px; line-height: 1.5; color: var(--ink-soft); max-width: 640px; }
.ms-canvas-wrap { position: relative; }
.ms-canvas { margin-top: 10px; border: 1px solid var(--rule); border-radius: 3px; background: var(--bg-deep); overflow: hidden; aspect-ratio: ${VB_W} / ${VB_H}; }
.ms-svg { display: block; width: 100%; height: 100%; }
.ms-clickable .ms-panel { cursor: pointer; }
.ms-clickable g.ms-panel:hover { filter: brightness(1.06); }
.ms-expand-btn { position: absolute; top: 18px; right: 8px; z-index: 2; background: var(--bg); opacity: 0.9; border: 1px solid var(--rule); border-radius: 2px; cursor: pointer; padding: 5px 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); }
.ms-expand-btn:hover { border-color: var(--accent); color: var(--accent); opacity: 1; }
.ms-exhibit.ms-expanded { position: fixed; inset: 0; z-index: 9999; margin: 0; padding: 18px 22px; background: var(--bg); overflow-y: auto; display: flex; flex-direction: column; }
.ms-exhibit.ms-expanded .ms-canvas-wrap { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
.ms-exhibit.ms-expanded .ms-canvas { width: min(100%, calc((100vh - 110px) * ${VB_W} / ${VB_H})); }
.ms-exhibit.ms-expanded .ms-legend, .ms-exhibit.ms-expanded .ms-key { display: none; }
.ms-legend { margin-top: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px 22px; max-width: 900px; }
.ms-legend-row { display: flex; align-items: flex-start; gap: 9px; }
.ms-swatch { flex: 0 0 auto; width: 22px; height: 22px; line-height: 0; margin-top: 1px; }
.ms-legend-text { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; }
.ms-legend-text strong { color: var(--ink); font-weight: 600; }
@media (max-width: 600px) {
  .ms-expand-btn { top: 16px; right: 6px; padding: 3px 7px; font-size: 9px; }
  .ms-exhibit.ms-expanded { padding: 10px; }
}
.ms-key { margin-top: 10px; font-size: 12px; color: var(--ink-faded); line-height: 1.55; font-style: italic; max-width: 780px; }
`;

// A panel's representative stone colour (for lists outside the canvas).
export const panelTone = (d) => tessera(hexToHue(d.color || '#8a7f70'), clamp01(d.depth == null ? 0.5 : d.depth), 0);
