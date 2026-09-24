// The reader's progress tracker: while an item is open, measure how much of it
// you read, watched or listened to, and add it to the item's `progress`
// (src/data/progress.js) every few seconds and when the reader closes.
//
// mode 'read'     — articles: active time (tab in view, some input in the last
//                   90 s) and how far down the article you got.
// mode 'player'   — a player that reports its position: time while it plays,
//                   and the parts that actually played (a jump to the end
//                   doesn't count as watched).
// mode 'estimate' — a player that reports nothing: time with the reader in
//                   view after you first pressed into the player.
import { useCallback, useEffect, useRef } from 'react';
import { recordProgress } from '../../data/progress.js';

const TICK_MS = 1000;
const FLUSH_MS = 15000;
const IDLE_MS = 90000;
const MAX_STEP_S = 4; // a position jump bigger than this is a seek, not playback

export function useProgress({ itemId, kind, mode, minutes, ready, scrollRef, articleRef, frameRef }) {
  const s = useRef(null);
  if (!s.current) {
    s.current = {
      pending: { ms: 0, spans: [], depth: 0, visit: true },
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
      if (!p.visit && p.ms < 500 && !p.spans.length && !p.depth) return;
      recordProgress(itemId, {
        kind, ms: Math.round(p.ms), visit: p.visit,
        estimated: mode === 'estimate',
        ...(mode === 'read' ? { depth: p.depth, minutes } : { spans: p.spans, dur: st.dur, pos: st.pos }),
      });
      st.pending = { ms: 0, spans: [], depth: 0, visit: false };
    };

    const measureDepth = () => {
      const sc = scrollRef?.current, art = articleRef?.current;
      if (!sc || !art || !art.offsetHeight) return;
      const view = sc.getBoundingClientRect(), a = art.getBoundingClientRect();
      const seen = Math.max(0, Math.min(1, (view.bottom - a.top) / a.height));
      if (seen > st.pending.depth) st.pending.depth = Math.round(seen * 100) / 100;
    };
    const onInput = () => { st.lastInput = Date.now(); };
    const onScroll = () => { onInput(); if (mode === 'read') measureDepth(); };
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
      if (mode === 'read' && ready) measureDepth();
    }, TICK_MS);
    const every = setInterval(flush, FLUSH_MS);
    const onHide = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);

    return () => {
      clearInterval(tick); clearInterval(every);
      events.forEach((e) => document.removeEventListener(e, onInput));
      sc?.removeEventListener('scroll', onScroll);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [itemId, kind, mode, minutes, ready]);

  return onPlayer;
}
