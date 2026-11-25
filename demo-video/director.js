// The demo video's director: a scripted camera, pointer, captions, callouts
// and effects over the real views page, stepped one frame at a time by
// record.mjs (window.__demo.frame(t)). Demo-only: none of this ships.
//
// Everything is a pure function of the time t, except the clicks and typing,
// which drive the real page once, in order, when their time comes.
import { EXAMPLES } from '/src/viewsdemo/examples.js';
import './director.css';

const W = 1920, H = 1080;
const NUCLEAR = EXAMPLES.find((e) => e.id === 'nuclear');
const COLORS = ['#4f8079', '#b84a3c', '#3d5875', '#8a6a1f'];
const params = new URLSearchParams(location.search);
const OPTS = { captions: params.get('captions') !== '0', callouts: params.get('callouts') !== '0' };

// ---------- maths ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, e) => a + (b - a) * e;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  linear: (x) => x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  out: (x) => 1 - Math.pow(1 - x, 3),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  in: (x) => x * x * x,
  smooth: (x) => x * x * x * (x * (x * 6 - 15) + 10),
  outBack: (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// A window's weight at t: 0 outside, 1 inside, eased fades at both ends.
const windowW = (t, a, b, fin = 0.35, fout = 0.3) => Math.min(E.inOutSine(prog(t, a, a + fin)), 1 - E.inOutSine(prog(t, b - fout, b)));

// ---------- the stage ----------
const html = document.documentElement;
html.classList.add('demo', 'demo-pre');
const root = document.getElementById('root');
const layer = document.createElement('div');
layer.id = 'demo-layer';
document.body.appendChild(layer);
const mk = (cls, inner = '', parent = layer) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = inner; parent.appendChild(d); return d; };

// ---------- camera ----------
// cam = the content point at the frame's centre, and the zoom.
let cam = { x: W / 2, y: H / 2, s: 1 };
let applied = null;
function applyCam(c) {
  cam = c;
  const key = `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.s.toFixed(5)}`;
  if (key === applied) return;
  applied = key;
  root.style.transform = `translate(${(W / 2 - c.x * c.s).toFixed(3)}px, ${(H / 2 - c.y * c.s).toFixed(3)}px) scale(${c.s.toFixed(5)})`;
}
const toScreen = (p) => ({ x: W / 2 + (p.x - cam.x) * cam.s, y: H / 2 + (p.y - cam.y) * cam.s });
// An element's box in content (untransformed page) coordinates.
function crect(el) {
  const r = el.getBoundingClientRect();
  const x = (r.left - W / 2) / cam.s + cam.x, y = (r.top - H / 2) / cam.s + cam.y;
  return { x, y, w: r.width / cam.s, h: r.height / cam.s, cx: x + r.width / cam.s / 2, cy: y + r.height / cam.s / 2 };
}
const $ = (sel, i = 0) => () => document.querySelectorAll(sel)[i];
const $find = (sel, text) => () => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(text));

// Camera targets. Each resolves once, when the move toward it starts.
//   look(getEl, s, ox, oy): the element's centre at screen (960+ox, 540+oy), zoom s
//   fit(getEl, w, h, ox, oy): zoomed so the element fills a w×h box
//   at(x, y, s): a fixed content point
const at = (x, y, s) => () => ({ x, y, s });
const look = (get, s, ox = 0, oy = 0, dx = 0, dy = 0) => () => { const r = crect(get()); return { x: r.cx + dx - ox / s, y: r.cy + dy - oy / s, s }; };
// the element's top edge at screen y `top`, its centre ox right of the middle
const topOf = (get, s, ox = 0, top = 60) => () => { const r = crect(get()); return { x: r.cx - ox / s, y: r.y + (540 - top) / s, s }; };
// the element's bottom edge at screen y `bottom`
const bottomOf = (get, s, ox = 0, bottom = 900) => () => { const r = crect(get()); return { x: r.cx - ox / s, y: r.y + r.h - (bottom - 540) / s, s }; };
const fit = (get, w, h, ox = 0, oy = 0, pad = 0) => () => {
  const r = crect(get()); const s = Math.min(w / (r.w + pad * 2), h / (r.h + pad * 2));
  return { x: r.cx - ox / s, y: r.cy - oy / s, s };
};

// A keyed track: [{t, to, ease}], each value resolved when its move starts.
function track(keys, mix) {
  keys.sort((a, b) => a.t - b.t);
  const val = [];
  const get = (i) => (val[i] ??= (typeof keys[i].to === 'function' ? keys[i].to() : keys[i].to));
  return (t) => {
    if (t <= keys[0].t) return get(0);
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
    if (i === keys.length - 1) return get(i);
    const a = get(i), next = keys[i + 1];
    // A move starts at `next.from` (default: when the previous key is reached).
    const t0 = next.from ?? keys[i].t;
    if (t < t0) return a;
    const b = get(i + 1);
    const e = (E[next.ease] || E.inOut)(prog(t, t0, next.t));
    return mix(a, b, e, next);
  };
}
// Zoom in log space; the centre follows so a zoom feels like one move.
const camMix = (a, b, e) => {
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), e));
  // Weight the centre by 1/s so a zoom pivots naturally.
  const wa = (1 - e) / a.s, wb = e / b.s, k = wa + wb ? wb / (wa + wb) : e;
  const ee = lerp(e, k, 0.6);
  return { x: lerp(a.x, b.x, ee), y: lerp(a.y, b.y, ee), s };
};
const ptMix = (a, b, e, key) => {
  // A pointer travels on a slight arc.
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  const bow = (key.bow ?? 0.1) * d * Math.sin(Math.PI * e);
  return { x: lerp(a.x, b.x, e) - (dy / (d || 1)) * bow, y: lerp(a.y, b.y, e) + (dx / (d || 1)) * bow };
};

// ---------- driving the page ----------
function point(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
const settle = () => new Promise((r) => setTimeout(r, 30));
// A real click on the page, made with the camera at rest so the page lays its
// pop-ups out in its own coordinates.
async function click(el) {
  const keep = root.style.transform;
  root.style.transform = 'none';
  const { x, y } = point(el);
  const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new MouseEvent('mousedown', o));
  if (el.focus && el.tagName === 'INPUT') el.focus({ preventScroll: true });
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.dispatchEvent(new MouseEvent('mouseup', o));
  el.dispatchEvent(new MouseEvent('click', o));
  await settle();
  await settle();
  root.style.transform = keep;
}
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
function typeInto(el, text) { setter.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); }

// ---------- CSS animations on the virtual clock ----------
const animStart = new WeakMap();
function stepAnimations(t) {
  for (const a of document.getAnimations()) {
    if (a.effect?.target && layer.contains(a.effect.target)) continue;
    if (!animStart.has(a)) { animStart.set(a, t); a.pause(); }
    const local = (t - animStart.get(a)) * 1000;
    try { a.currentTime = local; } catch {}
    const end = a.effect?.getComputedTiming?.().endTime;
    if (Number.isFinite(end) && local >= end) { try { a.finish(); } catch {} }
  }
}

// ---------- the layer's parts ----------
const spot = mk('dm-spot');
const cap = mk('dm-cap', '<span class="dm-cap-in"><span class="dm-cap-eye"></span><span class="dm-cap-text"></span></span>');
const call = mk('dm-call', '<div class="dm-call-in"></div>');
const opening = mk('dm-card');
const ending = mk('dm-card');
const ripple = mk('dm-ripple');
const cursor = mk('dm-cursor', `<svg viewBox="0 0 24 24"><path d="M3.2 1.6 L3.2 19.4 L7.9 15 L11 22 L14.2 20.6 L11.2 13.8 L17.6 13.6 Z" fill="#1a1612" stroke="#fbf6ee" stroke-width="1.5" stroke-linejoin="round"/></svg>`);

// ---------- effects ----------
const effects = [];
function effect(t0, t1, fx) { effects.push({ t0, t1, ...fx, state: 'idle' }); }
function runEffects(t) {
  for (const f of effects) {
    const armAt = f.armAt ?? f.t0;
    if (t < armAt || f.state === 'done') continue;
    if (f.state === 'idle') { f.arm?.(t); f.state = 'on'; }
    if (t <= f.t1) f.apply?.(t);
    else { f.apply?.(f.t1); f.finish?.(); f.state = 'done'; }
  }
}

// Stones rain down and settle into the mandala, ring by ring from the centre.
function rain(t0, { dur = 2.3, fall = 0.78, seed = 7, hold = 0.6, labelsAt = null, armAt = t0 } = {}) {
  let cells = [], extras = [];
  const settleT = 0.5;
  effect(t0, t0 + dur + fall + settleT + hold, {
    armAt,
    arm() {
      const svg = document.querySelector('.vd-mm-svg');
      const ctm = svg.getScreenCTM();
      const u = Math.hypot(ctm.a, ctm.b);
      const rand = rng(seed);
      const M = document.querySelectorAll('.vd-mm-num').length || 4;
      cells = [...document.querySelectorAll('.vd-mm-cell')].map((el) => {
        const k = Number((el.getAttribute('aria-label') || '').match(/on question (\d+)/)?.[1] || 1) - 1;
        const bb = el.getBBox();
        const sy = ctm.f + (bb.y + bb.height / 2) * ctm.d;
        const delay = (k / M) * dur * 0.62 + rand() * dur * 0.34;
        el.style.transformBox = 'fill-box';
        el.style.transformOrigin = 'center';
        return { el, delay, dy: -(sy + 140 + rand() * 260) / u, dx: (rand() - 0.5) * 40, r0: (rand() - 0.5) * 50, bh: 3 + rand() * 4 };
      });
      extras = [
        ...[...document.querySelectorAll('.vd-mm-hub, .vd-mm-hubt')].map((el) => ({ el, a: fall * 0.75, b: fall * 0.75 + 0.45, kind: 'pop' })),
        ...[...document.querySelectorAll('.vd-mm-num')].map((el, k) => ({ el, a: dur * 0.62 * (k / M) + fall + 0.2, b: dur * 0.62 * (k / M) + fall + 0.6, kind: 'pop' })),
        ...[...document.querySelectorAll('.vd-mm-label')].map((el, i) => ({ el, a: (labelsAt ?? dur + fall) + i * 0.12, b: (labelsAt ?? dur + fall) + i * 0.12 + 0.55, kind: 'fade' })),
      ];
      for (const x of extras) { x.el.style.transformBox = 'fill-box'; x.el.style.transformOrigin = 'center'; }
    },
    apply(t) {
      for (const c of cells) {
        const local = t - t0 - c.delay;
        let x = 0, y = 0, rot = 0, op = 1;
        if (local < 0) { op = 0; } else if (local < fall) {
          const p = local / fall, e = p * p;
          y = c.dy * (1 - e); x = c.dx * (1 - e); rot = c.r0 * (1 - e); op = Math.min(1, p * 3);
        } else if (local < fall + settleT) {
          const q = (local - fall) / settleT;
          y = -c.bh * Math.abs(Math.sin(q * Math.PI * 2)) * (1 - q) * (1 - q);
          rot = c.r0 * 0.05 * Math.sin(q * Math.PI * 3) * (1 - q);
        }
        c.el.style.opacity = op;
        c.el.style.transform = x || y || rot ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)` : '';
      }
      for (const x of extras) {
        const p = prog(t - t0, x.a, x.b);
        x.el.style.opacity = E.out(p);
        if (x.kind === 'pop') x.el.style.transform = `scale(${lerp(0.4, 1, E.outBack(p)).toFixed(3)})`;
        else x.el.style.transform = `translateY(${(lerp(8, 0, E.out(p))).toFixed(2)}px)`;
      }
    },
    finish() {
      for (const c of cells) { c.el.style.opacity = ''; c.el.style.transform = ''; }
      for (const x of extras) { x.el.style.opacity = ''; x.el.style.transform = ''; }
    },
  });
}

// The rest of the page settles in around the mandala.
function reveal(t0, t1, parts) {
  let els = [];
  effect(t0, t1, {
    arm() { els = parts.map(([sel, a, b]) => ({ list: [...document.querySelectorAll(sel)], a, b })); },
    apply(t) {
      for (const { list, a, b } of els) {
        const p = E.out(prog(t, a, b));
        for (const el of list) { el.style.opacity = p; el.style.transform = p < 1 ? `translateY(${(18 * (1 - p)).toFixed(2)}px)` : ''; }
      }
    },
    finish() { for (const { list } of els) for (const el of list) { el.style.opacity = ''; el.style.transform = ''; } },
  });
}

// One view at a time comes forward; the others go quiet.
function viewTour(segs, { quiet = 0.16 } = {}) {
  const t0 = segs[0].t0, t1 = segs[segs.length - 1].t1;
  effect(t0, t1, {
    apply(t) {
      const slices = document.querySelectorAll('.vd-mm-slice'), labels = document.querySelectorAll('.vd-mm-label');
      const act = windowW(t, t0, t1, 0.35, 0.4);
      slices.forEach((g, i) => {
        const w = Math.max(0, ...segs.filter((s) => s.i === i).map((s) => windowW(t, s.t0 - 0.15, s.t1 + 0.15, 0.3, 0.3)));
        g.style.opacity = lerp(1, quiet + (1 - quiet) * w, act).toFixed(3);
        const edge = g.querySelector('.vd-mm-edge'); if (edge) edge.style.strokeWidth = (3 * w * act).toFixed(2);
        if (labels[i]) labels[i].style.opacity = lerp(1, 0.3 + 0.7 * w, act).toFixed(3);
      });
      // the same view's row in the list beside it lights up with it
      document.querySelectorAll('.vd-vl-row').forEach((r, i) => {
        const w = Math.max(0, ...segs.filter((s) => s.i === i).map((s) => windowW(t, s.t0 - 0.15, s.t1 + 0.15, 0.3, 0.3)));
        r.style.opacity = lerp(1, 0.4 + 0.6 * w, act).toFixed(3);
        r.classList.toggle('on', w * act > 0.5);
      });
    },
    finish() {
      document.querySelectorAll('.vd-vl-row').forEach((r) => { r.style.opacity = ''; r.classList.remove('on'); });
      document.querySelectorAll('.vd-mm-slice, .vd-mm-label').forEach((g) => { g.style.opacity = ''; });
      document.querySelectorAll('.vd-mm-edge').forEach((e) => { e.style.strokeWidth = ''; });
    },
  });
}

// One ring at a time lights up, from the centre out.
function ringTour(segs, { quiet = 0.14 } = {}) {
  const t0 = segs[0].t0, t1 = segs[segs.length - 1].t1;
  effect(t0, t1, {
    apply(t) {
      const act = windowW(t, t0, t1, 0.35, 0.4);
      const wk = (k) => Math.max(0, ...segs.filter((s) => s.k === k).map((s) => windowW(t, s.t0 - 0.15, s.t1 + 0.15, 0.3, 0.3)));
      document.querySelectorAll('.vd-mm-cell').forEach((el) => {
        const k = Number((el.getAttribute('aria-label') || '').match(/on question (\d+)/)?.[1] || 1) - 1;
        el.style.opacity = lerp(1, quiet + (1 - quiet) * wk(k), act).toFixed(3);
      });
      document.querySelectorAll('.vd-mm-num').forEach((g, k) => {
        const w = wk(k) * act;
        const c = g.querySelector('circle'), tx = g.querySelector('text');
        if (c) { c.style.fill = w > 0.5 ? '#1a1612' : ''; c.style.stroke = w > 0.5 ? '#1a1612' : ''; }
        if (tx) tx.style.fill = w > 0.5 ? '#fff' : '';
        g.style.opacity = lerp(1, 0.45 + 0.55 * wk(k), act).toFixed(3);
        g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center';
        g.style.transform = `scale(${(1 + 0.25 * w).toFixed(3)})`;
      });
      // and its question in the list on the left, as the page itself marks it
      document.querySelectorAll('.vd-qi').forEach((q, k) => {
        const w = wk(k);
        q.classList.toggle('on', act > 0.5 && w > 0.5);
        q.classList.toggle('dim', act > 0.5 && w <= 0.5);
      });
    },
    finish() {
      document.querySelectorAll('.vd-qi').forEach((q) => q.classList.remove('on', 'dim'));
      document.querySelectorAll('.vd-mm-cell').forEach((el) => { el.style.opacity = ''; });
      document.querySelectorAll('.vd-mm-num').forEach((g) => {
        g.style.opacity = ''; g.style.transform = '';
        g.querySelectorAll('circle, text').forEach((x) => { x.style.fill = ''; x.style.stroke = ''; });
      });
    },
  });
}

// A quiet frame around one thing on screen.
function spotlight(t0, t1, get, { pad = 10, dim = 0.34 } = {}) {
  effect(t0, t1, {
    apply(t) {
      const el = get(); if (!el) return;
      const r = el.getBoundingClientRect();
      Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      spot.style.opacity = windowW(t, t0, t1, 0.4, 0.4).toFixed(3);
      spot.style.boxShadow = `0 0 0 4000px rgba(26, 22, 18, ${dim})`;
    },
    finish() { spot.style.opacity = 0; },
  });
}

// How far down a scroll box a child sits, in the box's own pixels.
const offsetIn = (box, child) => box.scrollTop + (child.getBoundingClientRect().top - box.getBoundingClientRect().top) / cam.s;
const changeMind = () => [...document.querySelectorAll('.vd-col-panel .vd-card-facts > li')].find((li) => /change its mind/i.test(li.textContent));

// Quiet some of the page for a while.
function fadeEls(t0, t1, sel, to) {
  effect(t0, t1, {
    apply(t) { const w = windowW(t, t0, t1, 0.4, 0.4); document.querySelectorAll(sel).forEach((e) => { e.style.opacity = lerp(1, to, w).toFixed(3); }); },
    finish() { document.querySelectorAll(sel).forEach((e) => { e.style.opacity = ''; }); },
  });
}

// Smoothly scroll a box inside the page.
function scrollBox(t0, t1, get, to, ease = 'inOut') {
  let from = 0, target = 0, el = null;
  effect(t0, t1, {
    arm() { el = get(); from = el?.scrollTop || 0; target = typeof to === 'function' ? to(el) : to; },
    apply(t) { if (el) el.scrollTop = lerp(from, target, E[ease](prog(t, t0, t1))); },
  });
}

// ---------- captions and callouts ----------
const captions = [];
const caption = (t0, t1, text, eye = '') => captions.push({ t0, t1, text, eye });
function drawCaption(t) {
  if (!OPTS.captions) { cap.style.opacity = 0; return; }
  const c = captions.find((x) => t >= x.t0 && t < x.t1);
  if (!c) { cap.style.opacity = 0; return; }
  if (cap.dataset.key !== `${c.t0}`) {
    cap.dataset.key = `${c.t0}`;
    cap.querySelector('.dm-cap-eye').textContent = c.eye;
    cap.querySelector('.dm-cap-eye').style.display = c.eye ? '' : 'none';
    cap.querySelector('.dm-cap-text').textContent = c.text;
  }
  const pin = E.out(prog(t, c.t0, c.t0 + 0.45)), pout = E.inOutSine(prog(t, c.t1 - 0.32, c.t1));
  cap.style.opacity = (pin * (1 - pout)).toFixed(3);
  cap.style.transform = `translateY(${(14 * (1 - pin) + 6 * pout).toFixed(2)}px)`;
}

const callouts = [];
const callout = (t0, t1, build, { x = 1300, y = 300, color = '#1a1612' } = {}) => callouts.push({ t0, t1, build, x, y, color });
function drawCallout(t) {
  if (!OPTS.callouts) { call.style.opacity = 0; return; }
  const c = callouts.find((x) => t >= x.t0 && t < x.t1);
  if (!c) { call.style.opacity = 0; return; }
  if (call.dataset.key !== `${c.t0}`) {
    call.dataset.key = `${c.t0}`;
    call.firstChild.innerHTML = c.build();
    call.style.setProperty('--c', c.color);
  }
  const pin = E.out(prog(t, c.t0, c.t0 + 0.42)), pout = E.inOutSine(prog(t, c.t1 - 0.3, c.t1));
  call.style.left = `${c.x}px`; call.style.top = `${c.y}px`;
  call.style.opacity = (pin * (1 - pout)).toFixed(3);
  call.style.transform = `translateX(${(22 * (1 - pin)).toFixed(2)}px)`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const tag = (map, id) => { const i = map.views.findIndex((v) => v.id === id); const v = map.views[i]; return `<span class="dm-tag" style="--c:${COLORS[i]}">${esc(v.short || v.name)}</span>`; };
const viewCard = (map, i) => () => {
  const v = map.views[i];
  const who = String(v.who || '').split(/;|,(?![^(]*\))/).slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ');
  return `<p class="dm-call-eye">View ${i + 1} of ${map.views.length}</p><p class="dm-call-title">${esc(v.name)}</p>
    <p class="dm-call-body">${esc(v.summary)}</p>${who ? `<p class="dm-call-who"><b>Held by</b>${esc(who)}</p>` : ''}`;
};
const ringCard = (map, k, withAnswers) => () => {
  const c = map.cruxes[k];
  const at = (pos) => map.views.filter((v) => (c.positions[v.id] || 'mid') === pos);
  const row = (pos, sw, label) => { const vs = at(pos); return vs.length ? `<li><i class="dm-sw ${sw}"></i><span>${esc(label)}<span class="dm-tags">${vs.map((v) => tag(map, v.id)).join('')}</span></span></li>` : ''; };
  return `<p class="dm-call-eye">Ring ${k + 1} of ${map.cruxes.length}${k === 0 ? ' · the centre' : k === map.cruxes.length - 1 ? ' · the rim' : ''}</p>
    <p class="dm-call-title"><span class="n">${k + 1}</span>${esc(c.question)}</p>
    ${withAnswers ? `<ul class="dm-rows">${row('left', '', c.left)}${row('right', 'pale', c.right)}${row('mid', 'striped', 'It depends')}</ul>` : ''}`;
};

// ---------- cards ----------
const TESSERAE = ['M3 4h7.5l-1 7H3z', 'M12 3.5l8.5 1.5-1.5 6.5-8-1z', 'M3 12.5h6.5l1.5 8H3z', 'M11.5 11.8l8 1.2L21 20.5h-8.5z'];
const TESS_COLORS = ['#8f2418', '#b8923a', '#6b7559', '#4a4038'];
function buildCards() {
  const words = (s) => s.split(' ').map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
  opening.innerHTML = `<p class="dm-card-eye">Mosaic · Views</p>
    <p class="dm-card-line">${words('Hard questions have')}<br>${words('more than two sides.')}</p>`;
  ending.innerHTML = `<div class="dm-brand"><svg viewBox="0 0 24 24">${TESSERAE.map((d, i) => `<path d="${d}" fill="${TESS_COLORS[i]}" style="transform-box:fill-box;transform-origin:center"/>`).join('')}</svg>
    <span class="dm-brand-name">Mosaic</span><span class="dm-brand-sub">Views</span></div>
    <div class="dm-rule"></div>
    <p class="dm-end-tag"><b>Every side of a question,</b> who holds it, and their sources.<br>Never a verdict.</p>`;
}
function drawOpening(t, t0, t1) {
  const out = E.inOutSine(prog(t, t1 - 0.7, t1));
  opening.style.opacity = (1 - out).toFixed(3);
  opening.style.display = t > t1 ? 'none' : '';
  const ws = opening.querySelectorAll('.w');
  ws.forEach((w, i) => {
    const p = E.out(prog(t, t0 + 0.35 + i * 0.13, t0 + 1.05 + i * 0.13));
    w.style.opacity = p.toFixed(3);
    w.style.transform = `translateY(${(26 * (1 - p)).toFixed(2)}px)`;
  });
  const eye = opening.querySelector('.dm-card-eye');
  eye.style.opacity = E.out(prog(t, t0 + 0.1, t0 + 0.8)).toFixed(3);
  // the line drifts a touch toward the viewer while it's up
  opening.querySelector('.dm-card-line').style.transform = `scale(${lerp(1, 1.035, E.inOutSine(prog(t, t0, t1))).toFixed(4)})`;
}
function drawEnding(t, t0) {
  ending.style.display = t < t0 ? 'none' : '';
  ending.style.opacity = E.inOutSine(prog(t, t0, t0 + 0.8)).toFixed(3);
  const ps = ending.querySelectorAll('.dm-brand path');
  ps.forEach((p, i) => {
    const a = t0 + 0.5 + i * 0.16, local = t - a, fall = 0.55;
    let y = 0, rot = 0, op = 1;
    if (local < 0) { op = 0; y = -40; } else if (local < fall) { const q = local / fall; y = -40 * (1 - q * q); rot = (i % 2 ? 1 : -1) * 30 * (1 - q * q); op = Math.min(1, q * 3); } else if (local < fall + 0.35) { const q = (local - fall) / 0.35; y = -1.2 * Math.abs(Math.sin(q * Math.PI * 2)) * (1 - q) * (1 - q); }
    p.style.opacity = op; p.style.transform = `translate(0px, ${y.toFixed(2)}px) rotate(${rot.toFixed(1)}deg)`;
  });
  const name = ending.querySelector('.dm-brand-name'), sub = ending.querySelector('.dm-brand-sub');
  const pn = E.out(prog(t, t0 + 1.0, t0 + 1.8));
  name.style.opacity = pn.toFixed(3); name.style.transform = `translateX(${(-18 * (1 - pn)).toFixed(2)}px)`;
  sub.style.opacity = E.out(prog(t, t0 + 1.4, t0 + 2.0)).toFixed(3);
  ending.querySelector('.dm-rule').style.width = `${(560 * E.inOut(prog(t, t0 + 1.7, t0 + 2.6))).toFixed(1)}px`;
  const pt = E.out(prog(t, t0 + 2.2, t0 + 3.1));
  const tagEl = ending.querySelector('.dm-end-tag');
  tagEl.style.opacity = pt.toFixed(3); tagEl.style.transform = `translateY(${(14 * (1 - pt)).toFixed(2)}px)`;
  // a slow push toward the end
  ending.firstChild.style.transform = `scale(${lerp(1, 1.03, E.inOutSine(prog(t, t0, t0 + 7))).toFixed(4)})`;
}

// ---------- the script ----------
// Times in seconds. See demo-video/SCRIPT.md for the shot list and captions.
const events = [];
const ev = (t, fn) => events.push({ t, fn, done: false });
let camTrack, curTrack, curVis = [], clicks = [];
const T = {};

function buildScript() {
  const svg = $('.vd-mm-svg');
  const mandala = (s, ox = 0, oy = -70) => look(svg, s, ox, oy, 0, 0);
  const num = (k) => $('.vd-mm-num', k);
  const label = (i) => $('.vd-mm-label', i);

  // 0. Opening line
  T.open = [0, 4.4];

  // 1. Ask
  T.ask = 4.0;
  const input = $('.vd-ask input'), go = $('.vd-ask button');
  const Q = NUCLEAR.question;
  const typeAt = T.ask + 2.3, perChar = 0.042;
  const typed = typeAt + Q.length * perChar;
  T.mapIt = typed + 0.85;
  caption(T.ask + 0.7, T.mapIt + 0.5, 'Ask a question people really disagree on.', 'Mosaic Views');
  ev(T.ask + 1.95, () => click(input()));
  for (let i = 1; i <= Q.length; i++) ev(typeAt + i * perChar + (i % 7 === 0 ? 0.03 : 0), () => typeInto(input(), Q.slice(0, i)));
  ev(T.mapIt, async () => { html.classList.remove('demo-pre'); await click(go()); });

  // 2. The stones fall into place
  T.rain = T.mapIt + 0.35;
  rain(T.rain, { dur: 2.3, fall: 0.8, labelsAt: 2.7, armAt: T.mapIt });
  reveal(T.mapIt, T.rain + 6.5, [
    ['.vd-stage-head', T.rain + 3.4, T.rain + 4.2],
    ['.vd-col-key', T.rain + 3.6, T.rain + 4.4],
    ['.vd-col-panel', T.rain + 3.8, T.rain + 4.6],
    ['.vd-cap', T.rain + 4.0, T.rain + 4.8],
    ['.vd-more, .vd-foot', T.rain + 4.2, T.rain + 5.0],
  ]);
  caption(T.rain + 0.3, T.rain + 3.9, 'Mosaic lays out the views on it, stone by stone.');

  // 3. The whole page
  T.wide = T.rain + 4.3;
  caption(T.wide, T.wide + 3.3, 'Four main views. Four questions they split on.');

  // 4. Each colour is a view
  T.views = T.wide + 3.6;
  const vdur = 2.15;
  const vsegs = NUCLEAR.views.map((v, i) => ({ i, t0: T.views + 0.5 + i * vdur, t1: T.views + 0.5 + (i + 1) * vdur }));
  viewTour(vsegs);
  caption(T.views + 0.4, T.views + 0.5 + 4 * vdur, 'Each colour is a view, and the people who hold it.');

  // 5. Each ring is a question
  T.rings = T.views + 0.5 + 4 * vdur + 0.3;
  const rdur = [2.0, 2.0, 2.0, 4.4];
  let rt = T.rings + 0.3;
  const rsegs = rdur.map((d, k) => { const s = { k, t0: rt, t1: rt + d }; rt += d; return s; });
  ringTour(rsegs);
  callout(rsegs[3].t0 + 0.6, rsegs[3].t1, ringCard(NUCLEAR, 3, true), { x: 1200, y: 240 });
  fadeEls(rsegs[3].t0 + 0.4, rsegs[3].t1 + 0.2, '.vd-col-panel', 0.12);
  caption(T.rings + 0.2, rsegs[1].t1, 'Each ring is a question they split on.');
  caption(rsegs[1].t1, rsegs[2].t1 + 0.4, 'They agree most at the centre, and split hardest at the rim.');
  caption(rsegs[3].t0 + 0.4, rsegs[3].t1, 'Solid stones give one answer. Pale stones give the other.');

  // 6. Open a ring
  T.ring = rsegs[3].t1 + 0.4;
  const pop = $('.vd-pop'), popIn = $('.vd-pop-in');
  const readItem = (side, j) => () => document.querySelectorAll('.vd-pop .vd-side')[side]?.querySelectorAll('.vd-read > li')[j];
  T.ringClick = T.ring + 1.3;
  ev(T.ringClick, () => click(num(3)()));
  caption(T.ring + 0.2, T.ringClick + 3.4, 'Every filled stone is a real piece, arguing that answer.');
  spotlight(T.ringClick + 1.7, T.ringClick + 5.4, readItem(0, 0), { pad: 10, dim: 0.07 });
  scrollBox(T.ringClick + 5.6, T.ringClick + 7.0, popIn, (el) => {
    const sides = el.querySelectorAll('.vd-side');
    return sides[1] ? offsetIn(el, sides[1]) - 8 : el.scrollHeight;
  });
  spotlight(T.ringClick + 7.2, T.ringClick + 10.4, readItem(1, 0), { pad: 10, dim: 0.07 });
  caption(T.ringClick + 3.6, T.ringClick + 10.6, 'Pieces for both answers, every link opened and read.');

  // 7. Pull back, then a view's whole case
  T.pull = T.ringClick + 10.8;
  T.viewClick = T.pull + 2.4;
  ev(T.pull + 0.2, () => document.querySelector('.vd-pop-x') && click(document.querySelector('.vd-pop-x')));
  ev(T.viewClick, () => click(label(2)()));
  const panel = $('.vd-col-panel');
  caption(T.viewClick - 0.6, T.viewClick + 3.6, 'Tap a view for its whole case: its answers, its reasons, its sources.');
  scrollBox(T.viewClick + 3.7, T.viewClick + 6.2, panel, (el) => {
    const r = el.querySelector('.vd-reasons'); return r ? offsetIn(el, r) - 90 : 400;
  });
  scrollBox(T.viewClick + 7.0, T.viewClick + 9.0, panel, (el) => {
    return el.scrollHeight - el.clientHeight;
  });
  caption(T.viewClick + 3.8, T.viewClick + 6.8, 'Each reason links to where it’s made.');
  caption(T.viewClick + 6.8, T.viewClick + 11.0, 'And what would change its mind.');
  spotlight(T.viewClick + 9.3, T.viewClick + 11.0, changeMind, { pad: 8, dim: 0 });

  // 8. Other questions
  T.more = T.viewClick + 11.3;
  const chip = (text) => $find('.vd-ex', text);
  // Close the open view first: the page can't yet switch maps with a view open.
  const closeView = async () => { const b = document.querySelector('.vd-detail-back'); if (b) await click(b); };
  ev(T.more + 1.0, async () => { await closeView(); await click(chip('kids under 16')()); });
  rain(T.more + 1.1, { dur: 1.3, fall: 0.6, seed: 11, labelsAt: 1.4, hold: 0.2, armAt: T.more + 1.0 });
  ev(T.more + 4.4, () => click(chip('vaccines')()));
  rain(T.more + 4.5, { dur: 1.3, fall: 0.6, seed: 23, labelsAt: 1.4, hold: 0.2, armAt: T.more + 4.4 });
  caption(T.more + 0.2, T.more + 3.9, 'Ready examples, researched and checked by hand.');
  caption(T.more + 3.9, T.more + 7.4, 'Or ask your own question, mapped from live search.');

  // 9. The end
  T.end = T.more + 7.6;
  T.duration = T.end + 5.8;

  // ---- camera ----
  const C = [];
  const key = (t, to, ease = 'inOut', from) => C.push({ t, to, ease, from });
  key(0, at(1318, 80, 2.1));
  key(T.ask, at(1318, 80, 2.1));
  key(T.ask + 1.8, look(input, 2.3, -120, -150), 'inOut');
  key(typed, look(input, 2.45, -60, -150), 'inOutSine', T.ask + 1.8);
  key(T.mapIt + 0.1, look(go, 2.45, 160, -150), 'inOut', typed + 0.1);
  key(T.rain + 1.2, mandala(1.9, 0, -60), 'inOut', T.mapIt + 0.2);
  key(T.rain + 3.5, mandala(2.0, 0, -60), 'inOutSine');
  key(T.wide + 0.9, at(960, 560, 1.0), 'inOut', T.rain + 3.5);
  key(T.views, at(960, 575, 1.03), 'inOutSine');
  // The tours frame the mandala with the list beside it, and drift to follow
  // the row that's lit, keeping it clear of the caption.
  const besideRow = (rowSel, i, s, ky = 0.55, top = 226) => () => {
    const m = crect(svg()), r = crect($(rowSel, i)());
    const left = Math.min(m.x, r.x), right = Math.max(m.x + m.w, r.x + r.w);
    let y = lerp(m.cy, r.cy, ky);
    const yTop = r.y + (540 - 70) / s;             // the highest y that keeps the row's top in frame
    y = Math.max(y, r.y + r.h - 380 / s);          // row bottom above the caption
    y = Math.max(y, top + 540 / s);                // the title stays out of frame
    y = Math.min(y, yTop);
    return { x: (left + right) / 2, y, s };
  };
  vsegs.forEach((sg, j) => key(sg.t0 + (j ? 0.7 : 0.9), besideRow('.vd-vl-row', sg.i, 1.38, 0.35), 'inOut', j ? sg.t0 - 0.05 : T.views));
  key(vsegs[3].t1, besideRow('.vd-vl-row', 3, 1.4, 0.35), 'inOutSine');
  rsegs.slice(0, 3).forEach((sg, j) => key(sg.t0 + (j ? 0.7 : 1.1), besideRow('.vd-qi', sg.k, 1.36, 0.4, 222), 'inOut', j ? sg.t0 - 0.05 : T.rings - 0.3));
  // The rim: the whole mandala, with its answers spelled out beside it.
  key(rsegs[3].t0 + 0.9, mandala(1.78, -330, -50), 'inOut', rsegs[3].t0 - 0.1);
  key(rsegs[3].t1 - 0.2, mandala(1.86, -340, -50), 'inOutSine');
  key(T.ring + 0.9, mandala(1.7, 80, -60), 'inOut', T.ring);
  key(T.ringClick + 0.3, mandala(1.7, 80, -60), 'inOutSine');
  key(T.ringClick + 1.5, topOf(pop, 1.6, -400, 46), 'inOut', T.ringClick + 0.25);
  key(T.ringClick + 10.4, topOf(pop, 1.66, -400, 40), 'inOutSine');
  key(T.pull + 1.5, mandala(1.45, 220, -70), 'inOut', T.pull);
  key(T.viewClick + 0.2, mandala(1.45, 220, -70), 'inOutSine');
  key(T.viewClick + 1.4, topOf(panel, 1.55, 150, 60), 'inOut', T.viewClick + 0.1);
  key(T.viewClick + 9.0, topOf(panel, 1.6, 150, 50), 'inOutSine');
  key(T.viewClick + 9.9, bottomOf(panel, 1.6, 150, 905), 'inOut', T.viewClick + 8.4);
  key(T.viewClick + 10.8, bottomOf(panel, 1.62, 150, 905), 'inOutSine');
  key(T.more + 0.9, at(960, 470, 1.12), 'inOut', T.viewClick + 10.8);
  key(T.more + 4.4, at(960, 480, 1.15), 'inOutSine');
  key(T.more + 6.6, mandala(1.42, -20, -40), 'inOut', T.more + 4.6);
  key(T.end, mandala(1.48, -20, -40), 'inOutSine');
  key(T.duration, mandala(1.48, -20, -40));
  camTrack = track(C, camMix);

  // ---- pointer ----
  const P = [];
  const pk = (t, to, ease = 'inOut', from, bow) => P.push({ t, to, ease, from, bow });
  const ptOf = (get, dx = 0, dy = 0) => () => { const r = crect(get()); return { x: r.cx + dx, y: r.cy + dy }; };
  pk(0, () => ({ x: 1500, y: 230 }));
  pk(T.ask + 0.9, () => ({ x: 1500, y: 230 }));
  pk(T.ask + 1.9, ptOf(input, -40, 4), 'inOut', T.ask + 0.9);
  pk(T.mapIt - 0.6, ptOf(input, -40, 4));
  pk(T.mapIt - 0.05, ptOf(go, 2, 4), 'inOut', T.mapIt - 0.6);
  pk(T.mapIt + 0.9, ptOf(go, 30, 70), 'out', T.mapIt + 0.15);
  pk(T.ringClick - 1.0, ptOf(svg, 160, 120), 'linear');
  pk(T.ringClick - 0.05, ptOf(num(3), 1, 2), 'inOut', T.ringClick - 1.0);
  pk(T.ringClick + 1.3, ptOf(num(3), 60, 70), 'out', T.ringClick + 0.2);
  pk(T.pull - 0.6, ptOf(num(3), 60, 70));
  pk(T.pull + 0.15, () => { const b = document.querySelector('.vd-pop-x'); return b ? (() => { const r = crect(b); return { x: r.cx, y: r.cy }; })() : { x: 900, y: 300 }; }, 'inOut', T.pull - 0.6);
  pk(T.viewClick - 1.1, ptOf(svg, -200, 60), 'inOut', T.pull + 0.4);
  pk(T.viewClick - 0.05, ptOf(label(2), -10, 2), 'inOut', T.viewClick - 1.1);
  pk(T.viewClick + 1.0, ptOf(label(2), 60, 60), 'out', T.viewClick + 0.2);
  pk(T.more + 0.2, ptOf(chip('kids under 16'), 60, 40), 'inOut', T.viewClick + 10.6);
  pk(T.more + 0.95, ptOf(chip('kids under 16'), 0, 2), 'inOut', T.more + 0.2);
  pk(T.more + 4.35, ptOf(chip('vaccines'), 0, 2), 'inOut', T.more + 3.4);
  pk(T.more + 5.4, ptOf(chip('vaccines'), 60, 80), 'out', T.more + 4.5);
  pk(T.duration, ptOf(chip('vaccines'), 60, 80));
  curTrack = track(P, ptMix);
  curVis = [[T.ask + 0.6, T.mapIt + 1.6], [T.ringClick - 1.4, T.ringClick + 1.8], [T.pull - 1.0, T.viewClick + 1.6], [T.more - 0.3, T.end + 0.2]];
  clicks = [T.ask + 1.95, T.mapIt, T.ringClick, T.pull + 0.2, T.viewClick, T.more + 1.0, T.more + 4.4];
}

function drawCursor(t) {
  const vis = Math.max(0, ...curVis.map(([a, b]) => windowW(t, a, b, 0.3, 0.3)));
  const p = toScreen(curTrack(t));
  // the pointer presses down on a click, and a ring spreads from it
  const press = Math.max(0, ...clicks.map((c) => { const q = prog(t, c - 0.12, c + 0.16); return q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0; }));
  cursor.style.opacity = vis.toFixed(3);
  cursor.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${(1 - 0.14 * press).toFixed(3)})`;
  const c = clicks.find((c) => t >= c && t < c + 0.55);
  if (c != null && vis > 0.5) {
    const q = (t - c) / 0.55;
    ripple.style.opacity = ((1 - q) * 0.8).toFixed(3);
    ripple.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${(0.6 + 2.4 * E.out(q)).toFixed(3)})`;
  } else ripple.style.opacity = 0;
  window.__demo.pointer = vis > 0.5 ? p : null;
}

// ---------- the frame ----------
async function frame(t) {
  for (const e of events) if (!e.done && e.t <= t) { e.done = true; await e.fn(); }
  stepAnimations(t);
  applyCam(camTrack(t));
  runEffects(t);
  drawCaption(t);
  drawCallout(t);
  drawOpening(t, T.open[0], T.open[1]);
  drawEnding(t, T.end);
  drawCursor(t);
}

async function ready() {
  await document.fonts.ready;
  for (let i = 0; i < 100 && !document.querySelector('.vd-mm-svg'); i++) await settle();
  buildCards();
  buildScript();
  window.__demo.duration = T.duration;
  window.__demo.marks = { ...T };
  window.__demo.captions = captions.map(({ t0, t1, text, eye }) => ({ t0, t1, text, eye }));
  await frame(0);
  window.__demo.ready = true;
}

window.__demo = { frame, ready: false, opts: OPTS, cam: () => cam };
ready();
