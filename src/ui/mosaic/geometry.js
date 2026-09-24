// Stone-cutting helpers for the mosaic: seeded randomness, stone colours,
// Voronoi cells and grout insets. Pure; no React.

export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// ---- colour: hue carries the subject, lightness carries shallow vs deep ----

export const hexToHue = (hex) => {
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
export const tessera = (hue, t, jitter, hueJit = 0, sparkle = 0) => {
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

export const polyCentroid = (poly) => {
  let x = 0, y = 0;
  poly.forEach((p) => { x += p[0]; y += p[1]; });
  return [x / poly.length, y / poly.length];
};

// Sutherland–Hodgman against one half-plane: keep what lies on the near side of
// the bisector between two seeds. Clipping by every other seed leaves the cell.
export const clipHalfPlane = (poly, mid, n) => {
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

export const voronoiCell = (site, others, region) => {
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
export const inset = (poly, amount) => {
  const c = polyCentroid(poly);
  return poly.map((p) => {
    const dx = p[0] - c[0], dy = p[1] - c[1];
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.max(0, 1 - amount / d);
    return [c[0] + dx * k, c[1] + dy * k];
  });
};

export const pathOf = (poly) =>
  poly.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('') + 'Z';


export const hashStr = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

