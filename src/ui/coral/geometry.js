// Coral geometry: a colony's body and where its polyps, buds and pearls sit.
// Pure and deterministic (seeded by the thread id). Local space: the base is
// (0, 0) and the colony grows toward negative y.
//
// Bodies are filled, tapered limbs built around curved centrelines (a width
// profile on each side, a rounded or open tip), then smoothed into SVG path
// strings. The renderer only paints what this file shapes.
//
// The body's reach comes from `depth` alone. Polyps are one per real session.
// A colony with no real movement is a bare nub: nothing else grows it.
import { rng } from './derive.js';

export const FORMS = ['staghorn', 'fan', 'pipes', 'mound'];
const MAX_W = 146; // a colony never leaves its slot
const MAX_H = 158; // nor reaches into the labels of the row above

// 14 at no movement, 160 at full depth.
const heightFor = (depth) => 14 + 146 * depth;

// ---------- small geometry helpers ----------
const lerp = (a, b, t) => a + (b - a) * t;
const quad = (p0, p1, p2, t) => {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
};
const curve = (p0, p1, p2, n) => Array.from({ length: n + 1 }, (_, i) => quad(p0, p1, p2, i / n));
const f1 = (v) => Math.round(v * 10) / 10;
const P = (p) => `${f1(p[0])} ${f1(p[1])}`;

// Closed Catmull-Rom spline through the points, as cubic Béziers.
export function closedPath(p) {
  const n = p.length;
  if (n < 3) return '';
  let d = `M${P(p[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], a = p[i], b = p[(i + 1) % n], p3 = p[(i + 2) % n];
    d += `C${P([a[0] + (b[0] - p0[0]) / 6, a[1] + (b[1] - p0[1]) / 6])} ${P([b[0] - (p3[0] - a[0]) / 6, b[1] - (p3[1] - a[1]) / 6])} ${P(b)}`;
  }
  return d + 'Z';
}
export function openPath(p) {
  const n = p.length;
  if (n < 2) return '';
  let d = `M${P(p[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = p[Math.max(i - 1, 0)], a = p[i], b = p[i + 1], p3 = p[Math.min(i + 2, n - 1)];
    d += `C${P([a[0] + (b[0] - p0[0]) / 6, a[1] + (b[1] - p0[1]) / 6])} ${P([b[0] - (p3[0] - a[0]) / 6, b[1] - (p3[1] - a[1]) / 6])} ${P(b)}`;
  }
  return d;
}
const circ = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
const ellipse = (x, y, rx, ry) => `M${f1(x - rx)} ${f1(y)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(2 * rx)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-2 * rx)} 0Z`;

// A tapered limb around a centreline. Returns its outline, the strips of light
// and shade that give it a round body, and side points for polyps.
function limb(c, w0, w1, cap = 'round') {
  const n = c.length - 1, R = [], L = [], hi = [], hiB = [], lo = [], loB = [], side = [];
  let tx = 0, ty = -1;
  for (let i = 0; i <= n; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(n, i + 1)];
    tx = b[0] - a[0]; ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1; tx /= m; ty /= m;
    const nx = -ty, ny = tx, t = i / n, hw = lerp(w0, w1, t) / 2, [x, y] = c[i];
    R.push([x + nx * hw, y + ny * hw]); L.push([x - nx * hw, y - ny * hw]);
    const s = Math.sqrt(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.02)));
    if (i > 0) {
      hi.push([x - nx * hw * (0.2 + 0.5 * s), y - ny * hw * (0.2 + 0.5 * s)]); hiB.push([x - nx * hw * 0.2, y - ny * hw * 0.2]);
      lo.push([x + nx * hw * 0.96, y + ny * hw * 0.96]); loB.push([x + nx * hw * (0.96 - 0.4 * s), y + ny * hw * (0.96 - 0.4 * s)]);
      side.push([x + nx * hw * 0.45 * (i % 2 ? 1 : -1), y + ny * hw * 0.45 * (i % 2 ? 1 : -1)]);
    }
  }
  const [ex, ey] = c[n], hw1 = w1 / 2, nx = -ty, ny = tx, capPts = [];
  if (cap === 'round') {
    for (const th of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) capPts.push([ex + (nx * Math.cos(th) + tx * Math.sin(th)) * hw1, ey + (ny * Math.cos(th) + ty * Math.sin(th)) * hw1]);
  } else {
    for (const th of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) capPts.push([ex + Math.cos(th) * hw1, ey - Math.sin(th) * hw1 * 0.34]);
  }
  return { outline: [...R, ...capPts, ...L.reverse()], shine: [...hi, ...hiB.reverse()], shade: [...lo, ...loB.reverse()], side, R, L: L.reverse() };
}

const bag = () => ({ parts: [], plates: [], tubes: [], membrane: null, shine: [], shade: [], mesh: [], grooves: [], holes: [], pores: [], caps: [], tips: [], mids: [], baseW: 10 });
const addLimb = (g, c, w0, w1, cap) => { const l = limb(c, w0, w1, cap); g.parts.push(l.outline); g.shine.push(l.shine); g.shade.push(l.shade); return l; };

// ---------- the four forms ----------

// Staghorn: thick antler branches that fork and taper to pale rounded tips.
function staghorn(r, H, depth) {
  const g = bag();
  const levels = 1 + (depth > 0.1) + (depth > 0.38) + (depth > 0.66);
  const first = H * [0.72, 0.5, 0.4, 0.33][levels - 1];
  const w = 8 + depth * 7;
  g.baseW = w + 6;
  const grow = (x, y, ang, len, w0, lv, lateral = false) => {
    const ex = x + Math.sin(ang) * len, ey = y - Math.cos(ang) * len;
    const bend = (r() - 0.5) * 0.7;
    const mx = (x + ex) / 2 + Math.cos(ang) * bend * len * 0.28, my = (y + ey) / 2 + Math.sin(ang) * bend * len * 0.28;
    const last = lv >= levels || lateral;
    const w1 = last ? Math.max(w0 * 0.62, 2.8) : w0 * 0.8;
    const c = curve([x, y], [mx, my], [ex, ey], 6);
    const l = addLimb(g, c, w0, w1);
    g.mids.push(...l.side);
    for (let i = 1; i < 6; i += 1) {
      const k = i % 2 ? 0.55 : -0.55, R = l.R[i], L = l.L[i];
      g.pores.push([lerp(L[0], R[0], 0.5 + k * 0.5), lerp(L[1], R[1], 0.5 + k * 0.5), 0.55]);
    }
    if (last) {
      g.tips.push([ex - Math.sin(ang) * w1 * 0.3, ey + Math.cos(ang) * w1 * 0.3]);
      g.caps.push([ex - Math.sin(ang) * w1 * 0.1, ey + Math.cos(ang) * w1 * 0.1, w1 * 0.62]);
      return;
    }
    const n = r() < 0.3 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.6 + r() * 0.25) + (r() - 0.5) * 0.22;
      grow(ex, ey, ang * 0.72 + spread, len * (0.7 + r() * 0.12), w1, lv + 1);
    }
    if (r() < 0.55) {
      const t = 0.45 + r() * 0.2, p = quad([x, y], [mx, my], [ex, ey], t), s = r() < 0.5 ? -1 : 1;
      grow(p[0], p[1], ang + s * (0.75 + r() * 0.3), len * 0.48, lerp(w0, w1, t) * 0.7, lv, true);
    }
  };
  grow(0, 3, (r() - 0.5) * 0.2, first + 3, w, 1);
  return g;
}

// Sea fan: a short stem, a lacy membrane spread between forking rays, a net
// of fine cross-veins and small open holes.
function fan(r, H, depth) {
  const g = bag();
  const oy = -Math.max(4, H * 0.13);
  addLimb(g, curve([0, 3], [(r() - 0.5) * 3, oy / 2], [0, oy], 4), 7.5, 4.6);
  g.baseW = 14;
  const k = 4 + Math.round(depth * 7), spread = 0.86 + depth * 0.22, rays = [];
  for (let i = 0; i < k; i++) {
    const a = -spread + (2 * spread * i) / (k - 1) + (r() - 0.5) * 0.08;
    const len = (H + oy) * (0.86 + r() * 0.14) * (1 - 0.1 * Math.abs(a) / spread);
    const p0 = [0, oy], p1 = [Math.sin(a * 0.75) * len * 0.5, oy - Math.cos(a * 0.75) * len * 0.55], p2 = [Math.sin(a * 1.06) * len, oy - Math.cos(a * 1.06) * len];
    const c = curve(p0, p1, p2, 7);
    rays.push({ p0, p1, p2, c });
    addLimb(g, c, 3.6, 1.5);
    g.tips.push(quad(p0, p1, p2, 0.94));
    if (depth > 0.3 && r() < 0.6) {
      const t0 = 0.5 + r() * 0.15, s = quad(p0, p1, p2, t0), aa = a + (r() < 0.5 ? -1 : 1) * 0.2;
      const l2 = (1 - t0) * len * 0.9, e = [s[0] + Math.sin(aa) * l2, s[1] - Math.cos(aa) * l2];
      addLimb(g, curve(s, [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2 - 1], e, 3), 2.2, 1.2);
      g.tips.push(e);
    }
  }
  // Membrane: up the outer rays, along a scalloped rim between the tips.
  const rim = [];
  rays.forEach((ray, i) => {
    rim.push(quad(ray.p0, ray.p1, ray.p2, i === 0 || i === k - 1 ? 0.97 : 1.02));
    if (i < k - 1) {
      const a = quad(ray.p0, ray.p1, ray.p2, 0.95), b = quad(rays[i + 1].p0, rays[i + 1].p1, rays[i + 1].p2, 0.95);
      rim.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
  });
  g.membrane = [...rays[0].c.slice(0, -1), ...rim, ...rays[k - 1].c.slice(0, -1).reverse()];
  // Net: cross-veins at a few distances out, small open holes in the cells.
  const fs = [0.14, 0.3, 0.45, 0.6, 0.74, 0.87, 0.97].filter((_, j, all) => j === 0 || j === all.length - 1 || j <= 1 + Math.round(depth * 4));
  const grid = fs.map((f) => rays.map((ray) => { const p = quad(ray.p0, ray.p1, ray.p2, f); return [p[0], p[1] + (r() - 0.5) * 1.6]; }));
  grid.slice(1, -1).forEach((row) => g.mesh.push(row));
  for (let j = 0; j < grid.length - 1; j++) {
    for (let i = 0; i < k - 1; i++) {
      const q = [grid[j][i], grid[j][i + 1], grid[j + 1][i], grid[j + 1][i + 1]];
      const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
      const cw = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), ch = Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]);
      if (cw < 3.5 || ch < 3.5) continue;
      if (cw > 11 && ch > 9) {
        g.holes.push([cx - cw * 0.2, cy, cw * 0.15, ch * 0.24], [cx + cw * 0.2, cy + (r() - 0.5) * 2, cw * 0.15, ch * 0.22]);
      } else g.holes.push([cx, cy, cw * 0.22, ch * 0.26]);
      if (j > 0 && r() < 0.5) g.mesh.push([grid[j][i], [cx, cy], grid[j + 1][i + 1]]);
      g.mids.push(grid[j + 1][i]);
    }
  }
  return g;
}

// Organ pipes: a cluster of upright tubes with hollow open tops, growth rings
// and thin platforms that tie the tubes together.
function pipes(r, H, depth) {
  const g = bag();
  const n = 2 + Math.round(depth * 6), gap = 8.8, span = (n - 1) * gap + 10;
  const tubes = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap + (r() - 0.5) * 3;
    const central = 1 - 0.42 * Math.abs(x) / (span / 2);
    const h = Math.max(6, H * (0.55 + 0.45 * r()) * central);
    const w = 7 + r() * 3 + depth * 1.5;
    const lean = (x / span) * 9 * depth + (r() - 0.5) * 3.5;
    tubes.push({ x, h, w, lean, by: r() < 0.5 ? -1.5 : 1, z: h + r() * 20 });
  }
  g.baseW = span + 6;
  // Platforms behind the tubes.
  const plat = (y, thick) => {
    const tall = tubes.filter((t) => t.h > -y + 5);
    if (tall.length < 2) return;
    const xs = tall.map((t) => t.x + t.lean * (-y / t.h)), lo = Math.min(...xs) - 6, hi = Math.max(...xs) + 6;
    g.plates.push([[lo, y], [lerp(lo, hi, 0.3), y - thick * 0.7], [lerp(lo, hi, 0.7), y - thick * 0.8], [hi, y], [lerp(lo, hi, 0.7), y + thick * 0.6], [lerp(lo, hi, 0.3), y + thick * 0.5]]);
  };
  plat(1, 4);
  if (depth > 0.35) plat(-H * 0.32, 2.4);
  if (depth > 0.7) plat(-H * 0.6, 2);
  for (const t of tubes.sort((a, b) => b.z - a.z)) {
    const top = [t.x + t.lean, t.by - t.h];
    const c = curve([t.x, t.by + 2], [t.x + t.lean * 0.25, t.by - t.h * 0.5], top, 5);
    const l = limb(c, t.w, t.w * 1.14, 'flat');
    const rings = [];
    for (let i = 1; i < 5; i++) {
      if (r() < 0.45) continue;
      const L = l.L[i], R = l.R[i], m = c[i];
      rings.push([L, [m[0], m[1] + t.w * 0.22], R]);
    }
    const rx = (t.w * 1.14) / 2;
    g.tubes.push({ pts: l.outline, shine: l.shine, shade: l.shade, rings, open: [top[0], top[1], rx, rx * 0.34] });
    g.tips.push([top[0], top[1] - 0.5]);
    g.mids.push(...l.side.slice(1, 5));
  }
  return g;
}

// Brain mound: a round dome cut by meandering grooves and ridges.
function mound(r, H, depth) {
  const g = bag();
  const rx = 13 + 50 * depth, ry = Math.max(7, Math.min(H * 0.5, rx * 0.95)), ph = r() * 6;
  const R = (t) => 1 + 0.035 * Math.sin(3 * t + ph);
  const dome = [];
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI;
    dome.push([-Math.cos(t) * rx * R(t), -Math.pow(Math.sin(t), 0.8) * ry * R(t)]);
  }
  g.parts.push([...dome, [rx * 0.8, 3], [0, 4], [-rx * 0.8, 3]]);
  g.baseW = rx * 2;
  g.shine.push(Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return [-rx * 0.34 + Math.cos(a) * rx * 0.26, -ry * 0.66 + Math.sin(a) * ry * 0.12 + Math.cos(a) * rx * 0.06];
  }));
  const m = 2 + Math.round(depth * 8);
  for (let j = 0; j < m; j++) {
    const f = (m - j) / (m + 1) * 0.95, freq = 6 + Math.round(r() * 5), wph = r() * 6;
    const amp = (Math.min(rx, ry) / (m + 1)) * 0.5;
    if (f * Math.min(rx, ry) < 5) continue;
    const arc = [];
    const N = 30 + Math.round(f * 60);
    for (let i = 0; i <= N; i++) {
      const t = 0.06 + (i / N) * (Math.PI - 0.12);
      const ux = -Math.cos(t), uy = -Math.pow(Math.sin(t), 0.8), wob = amp * Math.sqrt(f) * Math.sin(t * freq + wph);
      arc.push([ux * (rx * f * R(t) + wob), uy * (ry * f * R(t) + wob)]);
    }
    // Break the groove into meandering runs.
    let run = [];
    arc.forEach((p, i) => {
      if (i > 3 && r() < 0.035) { if (run.length > 3) g.grooves.push(run); run = []; return; }
      run.push(p);
    });
    if (run.length > 3) g.grooves.push(run);
    arc.forEach((p, i) => { if (i % 5 === 2) (j === 0 ? g.tips : g.mids).push(p); });
  }
  for (let i = 0; i < 10 + depth * 30; i++) {
    const t = r() * Math.PI, f = Math.sqrt(r()) * 0.92;
    g.pores.push([-Math.cos(t) * rx * f, -Math.pow(Math.sin(t), 0.8) * ry * f, 0.45 + r() * 0.35]);
  }
  return g;
}

const MAKE = { staghorn, fan, pipes, mound };

function shuffle(list, r) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// The sea-floor rock a colony sits on.
function rock(r, half) {
  const rh = 6 + 4 * Math.min(1, half / 60), top = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8, x = lerp(-half, half, u), q = 1 - Math.pow(2 * u - 1, 2);
    top.push([x, -rh * Math.pow(q, 0.55) + (i && i < 8 ? (r() - 0.5) * 2.6 : 0) + 3]);
  }
  const pts = [...top, [half * 0.6, 7], [0, 7.6], [-half * 0.6, 7]];
  let specks = '';
  for (let i = 0; i < 6 + half / 6; i++) {
    const x = (r() - 0.5) * half * 1.6, q = 1 - Math.pow(x / half, 2);
    specks += circ(x, 5 - (rh + 1) * Math.pow(Math.max(q, 0), 0.6) * r() * 0.9, 0.4 + r() * 0.5);
  }
  return { d: closedPath(pts), specks, half };
}

// Polyps as one path per layer: a ring of tentacles, a disc, a mouth.
export function polypPaths(polyps) {
  let tent = '', disc = '', mouth = '';
  for (const p of polyps) {
    const k = 8, step = (Math.PI * 2) / k, ri = p.r * 0.6, ro = p.r * 1.45;
    const at = (a, rad) => [p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad];
    tent += `M${P(at(p.a, ri))}`;
    for (let i = 0; i < k; i++) tent += `Q${P(at(p.a + (i + 0.5) * step, ro))} ${P(at(p.a + (i + 1) * step, ri))}`;
    tent += 'Z';
    disc += circ(p.x, p.y, p.r * 0.56);
    mouth += circ(p.x + p.r * 0.06, p.y + p.r * 0.08, p.r * 0.2);
  }
  return { tent, disc, mouth };
}

// → { form, width, height, body, plates, membrane, tubes, shine, shade, mesh, grooves,
//     holes, pores, caps, rock, polyps:[{x,y,r,a}], buds:[{x,h,d}], pearls:[{x,y,r}] }
export function growColony(c) {
  const r = rng(c.seed);
  const form = FORMS[c.seed % FORMS.length];
  const H = heightFor(c.depth);
  const g = MAKE[form](r, H, c.depth);

  // Fit inside the slot. Only ever shrinks.
  const all = [...g.parts.flat(), ...g.plates.flat(), ...g.tubes.flatMap((t) => t.pts), ...(g.membrane || [])];
  const xs = all.map((p) => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const w = maxX - minX || 1, h = -Math.min(...all.map((p) => p[1])) || 1;
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  const sc = (p) => [p[0] * k, p[1] * k];
  const scs = (list) => list.map((pts) => pts.map(sc));
  const join = (list, fn = closedPath) => scs(list).map((pts) => fn(pts)).join('');

  const tips = g.tips.map(sc), mids = g.mids.map(sc);
  const spots = [...shuffle(tips, r), ...shuffle(mids, r)];
  const shrink = Math.max(0.62, Math.min(1, 1.12 - c.real / 110)) * (form === 'fan' ? 0.8 : 1);
  const polyps = [];
  for (let i = 0; i < c.real; i++) {
    const [x, y] = spots.length ? spots[i % spots.length] : [0, -4];
    const extra = i >= spots.length ? 1 : 0; // past the last spot, crowd a polyp beside an earlier one
    polyps.push({ x: f1(x + extra * (r() - 0.5) * 9), y: f1(y + extra * (r() - 0.5) * 9), r: f1((3.9 + r() * 1.2) * shrink), a: f1(r() * 0.8) });
  }

  // Buds: a tiny young colony beside the base for each thread this one spawned.
  const baseHalf = (g.baseW * k) / 2;
  const buds = [];
  for (let i = 0; i < Math.min(c.spawned, 6); i++) {
    const side = i % 2 ? 1 : -1, step = Math.floor(i / 2);
    const x = side * Math.min(76, Math.max(13, baseHalf + 8) + step * 11);
    const bh = 6 + r() * 5, lean = (r() - 0.5) * 3 + side * 1.2;
    const main = limb(curve([x, 2], [x + lean * 0.3, 2 - bh / 2], [x + lean, 2 - bh], 3), 5.2, 3.2).outline;
    const sa = side * (0.7 + r() * 0.4), sp = [x + lean * 0.2, 2 - bh * 0.35], sl = bh * 0.5;
    const twig = limb(curve(sp, [sp[0] + Math.sin(sa) * sl * 0.5, sp[1] - sl * 0.6], [sp[0] + Math.sin(sa) * sl, sp[1] - Math.cos(sa) * sl], 3), 3.4, 2.4).outline;
    buds.push({ x: f1(x), h: f1(bh), d: closedPath(main) + closedPath(twig) });
  }
  // Pearls: a note you wrote, on the sea floor in front.
  const np = Math.min(c.reflections, 12), pearls = [];
  for (let i = 0; i < np; i++) pearls.push({ x: f1((i - (np - 1) / 2) * 8.2 + (r() - 0.5) * 2.4), y: f1(12 + (i % 2) * 4.2 + (r() - 0.5) * 1.4), r: f1(2.4 + r() * 0.6) });

  const budHalf = buds.length ? Math.max(...buds.map((b) => Math.abs(b.x))) + 7 : 0;
  const ground = rock(r, Math.min(80, Math.max(16, baseHalf + 9, budHalf)));

  return {
    form,
    width: (maxX - minX) * k,
    height: h * k,
    body: join(g.parts),
    plates: join(g.plates),
    membrane: g.membrane ? closedPath(g.membrane.map(sc)) : '',
    tubes: g.tubes.map((t) => ({
      d: closedPath(t.pts.map(sc)), shine: closedPath(t.shine.map(sc)), shade: closedPath(t.shade.map(sc)),
      rings: scs(t.rings).map(openPath).join(''),
      rim: ellipse(t.open[0] * k, t.open[1] * k, t.open[2] * k, t.open[3] * k),
      hollow: ellipse(t.open[0] * k, (t.open[1] + t.open[3] * 0.2) * k, t.open[2] * k * 0.66, t.open[3] * k * 0.56),
    })),
    shine: join(g.shine),
    shade: join(g.shade),
    mesh: join(g.mesh, openPath),
    grooves: join(g.grooves, openPath),
    holes: g.holes.map(([x, y, a, b]) => ellipse(x * k, y * k, Math.max(a * k, 0.6), Math.max(b * k, 0.6))).join(''),
    pores: g.pores.map(([x, y, rr]) => circ(x * k, y * k, rr)).join(''),
    caps: g.caps.map(([x, y, rr]) => circ(x * k, y * k, rr * k)).join(''),
    rock: ground,
    polyps, buds, pearls,
  };
}
