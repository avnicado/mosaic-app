// The reader's progress tracker: while an item is open, measure how much of it
// you read, watched or listened to, and add it to the item's `progress`
// (src/data/progress.js) every few seconds and when the reader closes.
//
// mode 'read'     — articles: active time (tab in view, some input in the last
//                   90 s), how far down the article you got, and how long you
//                   dwelt on each block (the one on a reading line a bit above
//                   the middle of the view). src/data/progress.js judges each
//                   block against your own learned pace.
// mode 'player'   — a player that reports its position: time while it plays,
//                   and the parts that actually played (a jump to the end
//                   doesn't count as watched).
// mode 'estimate' — a player that reports nothing: time with the reader in
//                   view after you first pressed into the player.
import { useCallback, useEffect, useRef } from 'react';
import { recordProgress, paceSamples, learnPace } from '../../data/progress.js';

const TICK_MS = 1000;
const FLUSH_MS = 15000;
const IDLE_MS = 90000;
const LINE = 0.4; // the reading line, as a share of the view's height from its top
const BLOCKS = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';
const MAX_STEP_S = 4; // a position jump bigger than this is a seek, not playback

export function useProgress({ itemId, kind, mode, provider, article, ready, scrollRef, articleRef, frameRef }) {
  const { minutes = null, expectSec = null, density = null } = article || {};
  const s = useRef(null);
  if (!s.current) {
    s.current = {
      pending: { ms: 0, spans: [], depth: 0, visit: true, bm: {} },
      bw: null, sess: [], sampled: new Set(), cur: -1,
      playing: false, lastPos: null, dur: null, pos: null,
      lastInput: Date.now(), engaged: false,
    };
  }

  // Player reports: { pos, dur, playing }.
  const onPlayer = useCallback(({ pos, dur, playing }) => {
    const st = s.current;
    if (typeof playing === 'boolean') st.playing = playing;
    if (dur > 0 && isFinite(dur)) st.dur = dur;
    if (typeof pos === 'number' && isFinite(pos)) {
      const step = st.lastPos == null ? null : pos - st.lastPos;
      if (st.playing && step > 0 && step <= MAX_STEP_S) st.pending.spans.push([st.lastPos, pos]);
      st.lastPos = pos;
      st.pos = pos;
    }
  }, []);

  useEffect(() => {
    if (!itemId) return undefined;
    const st = s.current;
    const flush = () => {
      const p = st.pending;
      if (!p.visit && p.ms < 500 && !p.spans.length && !p.depth && !Object.keys(p.bm).length) return;
      recordProgress(itemId, {
        kind, ms: Math.round(p.ms), visit: p.visit,
        estimated: mode === 'estimate',
        ...(mode === 'read' ? { depth: p.depth, minutes, expectSec, density, bw: st.bw, bm: p.bm } : { spans: p.spans, dur: st.dur, pos: st.pos, provider }),
      });
      st.pending = { ms: 0, spans: [], depth: 0, visit: false, bm: {} };
    };

    const measureDepth = () => {
      const sc = scrollRef?.current, art = articleRef?.current;
      if (!sc || !art || !art.offsetHeight) return;
      const view = sc.getBoundingClientRect(), a = art.getBoundingClientRect();
      const seen = Math.max(0, Math.min(1, (view.bottom - a.top) / a.height));
      if (seen > st.pending.depth) st.pending.depth = Math.round(seen * 100) / 100;
    };
    // Blocks of the article and where they sit, so the block on the reading line is cheap to find.
    let blocks = [], height = 0, lastT = performance.now();
    const measure = () => {
      const art = articleRef?.current;
      if (!art) return;
      const top = art.getBoundingClientRect().top;
      for (const b of blocks) { const r = b.el.getBoundingClientRect(); b.top = r.top - top; b.bottom = r.bottom - top; }
      height = art.offsetHeight;
    };
    const collect = () => {
      const art = articleRef?.current;
      if (mode !== 'read' || !ready || !art) return;
      blocks = [...art.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS))
        .map((el) => ({ el, words: (el.textContent.match(/\S+/g) || []).length })).filter((b) => b.words);
      st.bw = blocks.map((b) => b.words);
      if (st.sess.length !== blocks.length) { st.sess = blocks.map(() => 0); st.sampled = new Set(); }
      st.cur = -1;
      measure();
    };
    // The block on the reading line; between blocks, the last one above it.
    const atLine = () => {
      const sc = scrollRef?.current, art = articleRef?.current;
      if (!sc || !art || !blocks.length) return -1;
      if (art.offsetHeight !== height) measure();
      const line = sc.getBoundingClientRect().top + sc.clientHeight * LINE - art.getBoundingClientRect().top;
      let at = -1;
      for (let i = 0; i < blocks.length && blocks[i].top <= line; i++) at = i;
      return at;
    };
    // Give the time since the last call to the block that was on the line, then look again.
    const credit = () => {
      const now = performance.now(), dt = Math.min(now - lastT, 2 * TICK_MS);
      lastT = now;
      const active = !document.hidden && ready && Date.now() - st.lastInput < IDLE_MS;
      if (active && st.cur >= 0) {
        st.pending.bm[st.cur] = (st.pending.bm[st.cur] || 0) + dt;
        st.sess[st.cur] += dt;
      }
      st.cur = atLine();
    };
    // What this visit says about your pace; blocks you are still on are left out.
    const learn = () => {
      if (!st.bw) return;
      const ws = st.bw.map((w, i) => (st.sampled.has(i) ? 0 : w));
      const samples = paceSamples(ws, st.sess, st.cur);
      ws.forEach((w, i) => { if (samples.length && w && st.sess[i] >= 800) st.sampled.add(i); });
      learnPace(samples);
    };
    collect();
    const onInput = () => { st.lastInput = Date.now(); };
    const onScroll = () => { onInput(); if (mode === 'read') { measureDepth(); credit(); } };
    // A click into a cross-origin player moves focus to its iframe: the window blurs.
    const onBlur = () => { if (frameRef?.current && document.activeElement === frameRef.current) st.engaged = true; };

    const events = ['mousemove', 'keydown', 'touchstart', 'wheel', 'pointerdown'];
    events.forEach((e) => document.addEventListener(e, onInput, { passive: true }));
    const sc = scrollRef?.current;
    sc?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('blur', onBlur);

    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 2 * TICK_MS); // a sleeping laptop doesn't count
      last = now;
      const visible = !document.hidden;
      const active = mode === 'read' ? visible && ready && Date.now() - st.lastInput < IDLE_MS
        : mode === 'player' ? st.playing
          : visible && st.engaged;
      if (active) st.pending.ms += dt;
      if (mode === 'read' && ready) { measureDepth(); credit(); }
    }, TICK_MS);
    const every = setInterval(flush, FLUSH_MS);
    const onHide = () => { if (document.hidden) flush(); };
    const onPageHide = () => { flush(); learn(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(tick); clearInterval(every);
      events.forEach((e) => document.removeEventListener(e, onInput));
      sc?.removeEventListener('scroll', onScroll);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush();
      learn();
    };
  }, [itemId, kind, mode, provider, minutes, expectSec, density, ready]);

  return onPlayer;
}
