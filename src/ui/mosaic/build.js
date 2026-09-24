// Lays the reading mosaic as an SVG string.
//
//   a piece   — one item you engaged with. Size and depth come from what
//               happened (model.KINDS): moved you → large and dark; kept or
//               noted → middling; only opened → small and pale; closed the
//               question down → cut but uncoloured parchment. Its media icon is
//               set into it when there's room.
//   a panel   — one broad field. Hue is the field's own.
//   in a panel, pieces that share a topic are laid next to each other, so a
//               subject you keep coming back to shows as a patch.
//   fullness  — how much of the item you finished (data/progress.js) is laid
//               as a hand-drawn texture (hatching, cross-hatching, stipple
//               or ripples, picked at random per stone) that fills the stone
//               from the bottom up; a finished item is textured edge to edge.
//               No texture: Mosaic doesn't know (never opened in the reader).
//               Depth stays with what happened, texture with how much.
//   overlap   — fields that share topics are pulled together and joined by a
//               brass seam named with what they share. Pieces carrying a shared
//               topic are laid on the side facing the other field.
// Deterministic: the same record lays the same mosaic.
import {
  mulberry32, clamp, esc, tessera, voronoiCell, inset, pathOf, polyCentroid, hashStr, clipHalfPlane,
} from './geometry.js';
import { KINDS, UNSORTED, topicSlug } from './model.js';
import { iconMarkup } from '../icons.jsx';
import { CM_GROUND_DEFS } from '../../groundAssets.js';

export const VB_W = 1000;
export const VB_H = 470;
const SQ = 0.82; // the floor is seen a little from above
const GROUT = 1.4;

// One texture per stone, drawn in the stone's own ink. Every stone gets its
// own pattern, so angle, spacing and stipple layout vary like a hand did them.
const TEXTURES = ['hatch', 'cross', 'stipple', 'ripple'];
function texturePattern(id, type, r, ink) {
  const f = (n) => n.toFixed(2);
  const angle = Math.round(r() * 180);
  const sw = 0.5 + r() * 0.2;
  const line = (d) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${f(sw)}" stroke-linecap="round"/>`;
  let s, body;
  if (type === 'hatch') { s = 2.8 + r() * 1.2; body = line(`M0,${f(s / 2)}H${f(s)}`); }
  else if (type === 'cross') { s = 3.4 + r() * 1.2; body = line(`M0,${f(s / 2)}H${f(s)}M${f(s / 2)},0V${f(s)}`); }
  else if (type === 'ripple') {
    s = 4 + r() * 1.4;
    const a = 0.7 + r() * 0.5;
    body = line(`M0,${f(s / 2)}Q${f(s / 4)},${f(s / 2 - a)} ${f(s / 2)},${f(s / 2)}T${f(s)},${f(s / 2)}`);
  } else {
    s = 5 + r() * 1.5;
    body = Array.from({ length: 4 }, () => `<circle cx="${f(r() * s)}" cy="${f(r() * s)}" r="${f(0.42 + r() * 0.22)}" fill="${ink}"/>`).join('');
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${f(s)}" height="${f(s)}" patternTransform="rotate(${angle})">${body}</pattern>`;
}

export function buildReadingMosaic({ fields, links }) {
  if (!fields.length) return '';
  const rand = mulberry32(hashStr(fields.map((f) => f.name).join('|')) || 7);

  // ---- 1. panels, sized by what's in them --------------------------------------
  const panels = fields.map((f, idx) => {
    const pr = mulberry32(hashStr(f.name) || idx + 1);
    // Each piece's topic "patch": its topic that is most common in this field.
    const patchOf = (p) => (p.topics.length
      ? p.topics.reduce((best, t) => (f.topicCount.get(t) > f.topicCount.get(best) ? t : best), p.topics[0])
      : '');
    const groups = new Map();
    for (const p of f.pieces) {
      const k = patchOf(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const kindRank = { moved: 0, kept: 1, read: 2, closed: 3 };
    const ordered = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))
      .flatMap(([k, ps]) => ps.sort((a, b) => kindRank[a.kind] - kindRank[b.kind] || a.ts - b.ts).map((p) => ({ p, patch: k })));
    const pieces = ordered.map(({ p, patch }) => ({
      p, patch, r: KINDS[p.kind].r * (0.92 + pr() * 0.16),
      jitter: pr() * 2 - 1, hueJit: pr() * 2 - 1, sparkle: pr() > 0.88 ? pr() : 0,
    }));
    // Lay the stones around (0, 0), unsquashed. Each stone is set against one
    // already laid on its own topic when there is one, so a topic forms a patch.
    const sites = [];
    const fits = (x, y, r) => sites.every((s) => Math.hypot(x - s[0], y - s[1]) > (r + s.r) * 0.84);
    pieces.forEach((piece, k) => {
      let pick;
      if (k === 0) pick = [0, 0];
      else {
        const same = piece.patch ? sites.filter((s) => s.piece.patch === piece.patch) : [];
        const pool = same.length ? same : sites;
        const cands = [];
        let fallback = null;
        for (let attempt = 0; attempt < 260 && cands.length < 16; attempt++) {
          const anchor = pool[Math.floor(pr() * pool.length)];
          const a = pr() * 6.283;
          const dist = (anchor.r + piece.r) * (0.88 + pr() * 0.2);
          const x = anchor[0] + Math.cos(a) * dist, y = anchor[1] + Math.sin(a) * dist;
          fallback = [x, y];
          if (fits(x, y, piece.r)) cands.push([x, y]);
        }
        if (cands.length) {
          cands.sort((u, v) => Math.hypot(u[0], u[1]) - Math.hypot(v[0], v[1]));
          pick = cands[Math.min(cands.length - 1, Math.floor(pr() * pr() * 3))];
        } else pick = fallback;
      }
      pick.r = piece.r; pick.piece = piece;
      sites.push(pick);
    });
    let reach = 0;
    sites.forEach((s) => { reach = Math.max(reach, Math.hypot(s[0], s[1]) + s.r); });
    return { idx, f, pr, sites, reach, radius: reach + 6, wob: [pr() * 6.28, pr() * 6.28, pr() * 6.28] };
  });

  // Scale the whole floor so a small record is laid large and a big one fits.
  const footprint = panels.reduce((s, p) => s + Math.PI * p.radius * p.radius * SQ, 0);
  const S = clamp(Math.sqrt((0.25 * VB_W * VB_H) / footprint), 0.3, 2.4);
  const scalePanel = (p, k) => {
    p.sites.forEach((s) => { s[0] *= k; s[1] *= k; s.r *= k; });
    p.reach *= k; p.radius *= k;
  };
  panels.forEach((p) => scalePanel(p, S));

  // ---- 2. place panels: linked fields sit close, everything else keeps apart -----
  // Distances are measured on the squashed floor; each panel is an ellipse,
  // plus room under it for its caption.
  const linkOf = new Map();
  links.forEach((l) => { linkOf.set(l.a + ':' + l.b, l); linkOf.set(l.b + ':' + l.a, l); });
  const maxStrength = Math.max(1, ...links.map((l) => l.strength));
  const cx0 = VB_W / 2, cy0 = VB_H / 2 - 10;
  const a0 = rand() * 6.283;
  panels.forEach((p, i) => {
    const r = i === 0 ? 0 : 50 + Math.sqrt(i) * 95;
    const a = a0 + i * 2.39996;
    p.cx = cx0 + Math.cos(a) * r; p.cy = cy0 + Math.sin(a) * r * SQ;
  });
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const A = panels[i], B = panels[j];
        let dx = B.cx - A.cx, dy = (B.cy - A.cy) / SQ;
        const d = Math.hypot(dx, dy) || 0.01;
        dx /= d; dy /= d;
        const link = linkOf.get(i + ':' + j);
        const touch = A.radius + B.radius;
        // Captions sit under panels, so vertical neighbours need more room.
        const capRoom = 22 + 16 * Math.abs(dy);
        const rest = link ? touch + capRoom + 4 * (1 - link.strength / maxStrength) : touch + capRoom + 30;
        let move = 0;
        if (d < rest) move = (rest - d) / 2;
        else if (link) move = -Math.min(4, (d - rest) * 0.06);
        if (!move) continue;
        A.cx -= dx * move; A.cy -= dy * move * SQ;
        B.cx += dx * move; B.cy += dy * move * SQ;
      }
    }
    if (iter < 240) panels.forEach((p) => { p.cx += (cx0 - p.cx) * 0.01; p.cy += (cy0 - p.cy) * 0.01; });
  }
  // Fit the arrangement inside the frame, shrinking it if it must.
  {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    panels.forEach((p) => {
      minX = Math.min(minX, p.cx - p.radius); maxX = Math.max(maxX, p.cx + p.radius);
      minY = Math.min(minY, p.cy - p.radius * SQ); maxY = Math.max(maxY, p.cy + p.radius * SQ + 22);
    });
    const k = Math.min(1, (VB_W - 40) / (maxX - minX), (VB_H - 24) / (maxY - minY));
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    panels.forEach((p) => {
      p.cx = VB_W / 2 + (p.cx - mx) * k;
      p.cy = VB_H / 2 - 4 + (p.cy - my) * k;
      scalePanel(p, k);
    });
  }

  // Turn each panel so the stones it shares with other fields face them.
  panels.forEach((P, pi) => {
    const shared = new Set();
    let tx = 0, ty = 0;
    links.forEach((l) => {
      if (l.a !== pi && l.b !== pi) return;
      const o = panels[l.a === pi ? l.b : l.a];
      const dx = o.cx - P.cx, dy = (o.cy - P.cy) / SQ, d = Math.hypot(dx, dy) || 1;
      tx += (dx / d) * l.strength; ty += (dy / d) * l.strength;
      l.shared.forEach(({ topic }) => shared.add(topic));
    });
    let vx = 0, vy = 0;
    P.sites.forEach((s) => { if (s.piece.p.topics.some((t) => shared.has(t))) { vx += s[0]; vy += s[1]; } });
    if ((tx || ty) && Math.hypot(vx, vy) > 1) {
      const rot = Math.atan2(ty, tx) - Math.atan2(vy, vx);
      const c = Math.cos(rot), sn = Math.sin(rot);
      P.sites.forEach((s) => { const x = s[0], y = s[1]; s[0] = x * c - y * sn; s[1] = x * sn + y * c; });
    }
    // Onto the floor.
    P.sites.forEach((s) => { s[0] = P.cx + s[0]; s[1] = P.cy + s[1] * SQ; });
  });

  // ---- 3. cut the pieces ------------------------------------------------------------
  const beds = [], tiles = [], icons = [], seams = [], labels = [], patterns = [];

  panels.forEach((P) => {
    const { pr, sites, reach } = P;
    const region = [];
    const VN = 32;
    for (let i = 0; i < VN; i++) {
      const a = (i / VN) * 6.283;
      const lobe = 1 + 0.1 * Math.sin(2 * a + P.wob[0]) + 0.06 * Math.sin(3 * a + P.wob[1]) + 0.04 * Math.sin(5 * a + P.wob[2]);
      const rr = (reach + 8) * lobe;
      region.push([P.cx + Math.cos(a) * rr, P.cy + Math.sin(a) * rr * SQ]);
    }

    // The real extent of what was laid; the cells are cut against a ring of
    // unlaid "field" stones so the outer pieces keep a cut edge.
    const ring = [];
    const nRing = Math.max(8, Math.round((reach * 6.283) / 26));
    for (let i = 0; i < nRing; i++) {
      const a = (i / nRing) * 6.283 + pr() * 0.3;
      const rr = reach + 10 + pr() * 8;
      const s = [P.cx + Math.cos(a) * rr, P.cy + Math.sin(a) * rr * SQ];
      s.r = 12; ring.push(s);
    }
    const all = [...sites, ...ring];
    const cells = sites.map((s) => ({ s, cell: voronoiCell(s, all, region) })).filter((c) => c.cell.length >= 3);

    const fid = esc(P.f.name);
    const cellPaths = cells.map(({ cell }) => `<path d="${pathOf(cell)}"/>`).join('');
    beds.push(`<g class="rm-bed">` +
      `<g fill="rgba(44,32,18,0.18)" transform="translate(2.5 3.5)">${cellPaths}</g>` +
      `<g fill="rgba(52,42,30,0.44)">${cellPaths}</g></g>`);

    const unsorted = P.f.name === UNSORTED;
    cells.forEach(({ s, cell }) => {
      const face = inset(cell, GROUT);
      if (face.length < 3) return;
      const { p, jitter, hueJit, sparkle } = s.piece;
      const K = KINDS[p.kind];
      const topics = p.topics.map(topicSlug).join(' ');
      const how = p.fill ? (p.fill.done ? ' · finished' : ` · ${Math.round(p.fill.level * 100)}% of the way`) : '';
      const tip = `${p.title}${p.source ? ' — ' + p.source : ''}\n${K.label}${how}${p.topics.length ? ' · ' + p.topics.join(', ') : ''}`;
      const open = `<g class="rm-piece k-${p.kind}" data-item="${esc(p.id)}" data-t="${esc(topics)}" data-f="${fid}"><title>${esc(tip)}</title>`;
      let fill, dark = false;
      if (K.t == null || unsorted) {
        fill = `hsl(40 ${unsorted ? 14 : 34}% ${(K.t == null ? 91 : 84 - (K.t || 0) * 30) + jitter * 2}%)`;
        dark = !unsorted ? false : (K.t || 0) > 0.8;
      } else {
        fill = tessera(P.f.hue, K.t, jitter, hueJit, sparkle);
        dark = K.t > 0.7;
      }
      const dash = K.t == null ? ' stroke-dasharray="2.5 2.2"' : '';
      // Fullness: texture from the bottom of the stone up to how far you got.
      let texture = '';
      if (p.fill && p.fill.level > 0) {
        const tr = mulberry32(hashStr(p.id) || 3);
        const pid = `rm-tx-${patterns.length}`;
        const ink = dark ? 'rgba(255,248,236,0.62)' : 'rgba(38,28,16,0.5)';
        patterns.push(texturePattern(pid, TEXTURES[Math.floor(tr() * TEXTURES.length)], tr, ink));
        const ys = face.map((pt) => pt[1]);
        const top = Math.min(...ys), bot = Math.max(...ys);
        const level = p.fill.done ? 1 : Math.max(0.08, p.fill.level);
        const part = level >= 1 ? face : clipHalfPlane(face, [0, bot - (bot - top) * level], [0, -1]);
        if (part.length >= 3) texture = `<path class="rm-tx" d="${pathOf(part)}" fill="url(#${pid})"/>`;
      }
      tiles.push(open +
        `<path d="${pathOf(face)}" fill="${fill}" stroke="rgba(30,22,12,0.48)" stroke-width="0.7" stroke-linejoin="round"${dash}/>` + texture +
        `<path d="${pathOf(inset(face, 1.2))}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.9" stroke-linejoin="round"/>` +
        `</g>`);
      // The media icon, set into the stone where it fits.
      if (s.r >= 11) {
        const [x, y] = polyCentroid(face);
        const size = clamp(s.r * 0.78, 10, 17);
        const ink = dark ? 'rgba(255,250,240,0.78)' : 'rgba(40,30,18,0.5)';
        icons.push(iconMarkup(p.mediaType, { x: x - size / 2, y: y - size / 2, size, color: ink, accent: ink, width: 1.9 }));
      }
    });

    // Caption: the field, and how many pieces.
    let bottom = P.cy;
    cells.forEach(({ cell }) => cell.forEach((pt) => { if (pt[1] > bottom) bottom = pt[1]; }));
    P.bottom = bottom;
    labels.push({ x: P.cx, y: bottom + 14, text: `${P.f.name} · ${P.f.pieces.length}`, field: fid, unsorted });
  });

  // ---- 4. seams between fields that share topics --------------------------------------
  links.slice(0, 8).forEach((l) => {
    const A = panels[l.a], B = panels[l.b];
    const dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1;
    const x1 = A.cx + (dx / d) * A.radius * 0.7, y1 = A.cy + (dy / d) * A.radius * 0.7 * SQ;
    const x2 = B.cx - (dx / d) * B.radius * 0.7, y2 = B.cy - (dy / d) * B.radius * 0.7 * SQ;
    const w = 1.2 + 2.2 * (l.strength / maxStrength);
    const topics = l.shared.map((x) => x.topic);
    const slugs = topics.map(topicSlug).join(' ');
    seams.push(`<g class="rm-seam" data-t="${esc(slugs)}"><title>${esc(`${A.f.name} and ${B.f.name} share: ${topics.join(', ')}`)}</title>` +
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--gold)" stroke-width="${w.toFixed(1)}" stroke-linecap="round" stroke-dasharray="1 ${(w + 3).toFixed(1)}" opacity="0.85"/>` +
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="transparent" stroke-width="12"/></g>`);
  });

  // Captions never sit on each other.
  labels.forEach((l) => { l.w = l.text.length * 6.3 + 10; });
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const A = labels[i], B = labels[j];
        const ox = (A.w + B.w) / 2 - Math.abs(B.x - A.x), oy = 14 - Math.abs(B.y - A.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const s = (B.y >= A.y ? 1 : -1) * (oy / 2 + 0.5);
        A.y -= s; B.y += s;
      }
    }
    if (!moved) break;
  }
  const labelEls = labels.map((l) => {
    const x = clamp(l.x, l.w / 2 + 6, VB_W - l.w / 2 - 6), y = clamp(l.y, 14, VB_H - 6);
    return `<text class="rm-label" data-f="${l.field}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" ` +
      `style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:0.06em;text-transform:uppercase;` +
      `fill:var(${l.unsorted ? '--ink-faded' : '--ink-soft'});stroke:var(--bg);stroke-width:3.2;paint-order:stroke${l.unsorted ? ';font-style:italic' : ''}">${esc(l.text)}</text>`;
  });

  return `<svg class="rm-svg" viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">` +
    CM_GROUND_DEFS + (patterns.length ? `<defs>${patterns.join('')}</defs>` : '') + `<use href="#cm-ground" transform="scale(1 ${(VB_H / 420).toFixed(4)})"/>` +
    seams.join('') + beds.join('') + tiles.join('') + icons.join('') + labelEls.join('') +
    `</svg>`;
}
