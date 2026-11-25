// The public views page (/views). Pick or ask a question and the mandala fills
// the screen: each slice a view, each ring a question they split on. Around it
// sit the questions (with the views that give each answer) and the views; tap
// a slice and that view's reasons and real articles open beside the chart, or
// in a sheet on a phone. It never rules on the question. Ready examples load
// instantly; a typed question is mapped live by /api/views-demo when it's on.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DemoMandala, { answerText, anchorPoint } from './DemoMandala.jsx';
import { EXAMPLES, exampleFor } from './examples.js';
import { closestTo, SOURCE_COUNT, hostOf, titleDenies, notAnArgument, standingOf, dateOf } from '../engine/viewsDemo.js';
import { Icon } from '../ui/icons.jsx';
import { fetchRingSides } from './ringSides.js';
import { MEDIA } from '../media.js';
import { t, tp, loc, useLang } from '../i18n/index.js';

// Mosaic's own palette: its teal, coral, slate blue and ochre.
const COLORS = ['#4f8079', '#b84a3c', '#3d5875', '#8a6a1f'];
const colorOf = (map, id) => COLORS[Math.max(0, map.views.findIndex((v) => v.id === id)) % COLORS.length];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return { ex: p.get('ex'), q: p.get('q') };
}
function writeUrl(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const next = `${window.location.pathname}${p.toString() ? `?${p}` : ''}`;
  window.history.replaceState(null, '', next);
}

const fmtDate = (d) => {
  if (!d) return '';
  const [y, m] = String(d).split('-');
  if (!m) return y;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(loc(), { month: 'short', year: 'numeric' });
};

// The outlet is written by the model, so it can give a page more standing than
// it has: a document tabled by one senator at a hearing came back credited to
// "Australian Government (APH)". The standing is read off the URL instead, and
// shown beside the outlet, so the reader can weigh the page themselves. Mosaic
// does not rule on a question, so a page of lesser standing is labelled, never
// hidden. See docs/views-review-2026-11-24.md.
// standingOf() returns fixed English labels (checked by scripts); they're
// translated here, where they're shown.
function standingLabel(s) {
  switch (s) {
    case 'Submitted to a hearing': return t('Submitted to a hearing');
    case 'Transcript of remarks': return t('Transcript of remarks');
    case 'Preprint, not peer reviewed': return t('Preprint, not peer reviewed');
    case 'Posted to an open archive': return t('Posted to an open archive');
    case 'Peer reviewed': return t('Peer reviewed');
    case 'Government or official body': return t('Government or official body');
    case 'University': return t('University');
    default: return s;
  }
}
// A piece's kind (Article, Paper…): read from its type when it has one, so it
// follows the interface language even when it was saved in another.
const typeLabel = (s) => (s.type && MEDIA[s.type] ? MEDIA[s.type].label : s.label);

function SourceLink({ s, withQuote = true }) {
  const standing = standingOf(s.url);
  // Maps saved before the search was asked for a publish date carry none, so
  // the URL is read for one. A piece's year is not a detail here: a 1997
  // transcript was cited on a question about 2022.
  const when = s.date || dateOf(s);
  return (
    <li className="vd-src">
      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || hostOf(s.url)}<span aria-hidden="true"> ↗</span></a>
      <span className="vd-src-meta">{[s.author, s.outlet || hostOf(s.url), fmtDate(when)].filter(Boolean).join(' · ')}</span>
      {standing && <span className="vd-src-standing">{standingLabel(standing)}</span>}
      {withQuote && s.quote && <q className="vd-src-quote">{s.quote}</q>}
    </li>
  );
}

function Tag({ map, view, focus, onFocus, small }) {
  const dim = focus && focus !== view.id;
  return (
    <button type="button" className={`vd-tag ${dim ? 'dim' : ''} ${focus === view.id ? 'on' : ''} ${small ? 'small' : ''}`}
      style={{ '--c': colorOf(map, view.id) }} onClick={() => onFocus(focus === view.id ? null : view.id)}
      aria-pressed={focus === view.id} title={view.name}>
      {view.short || view.name}
    </button>
  );
}

function Wording({ map, focus, onFocus }) {
  const w = map.wording;
  if (!w?.assumes) return null;
  const away = map.views.filter((v) => w.leansAwayFrom.includes(v.id));
  return (
    <section className="vd-wording" aria-label={t('How the question is worded')}>
      <span className="vd-wording-label">{t('Notice the wording')}</span>
      <p>{w.assumes}{away.length > 0 && ` ${t('Views that reject that framing:')} `}
        {away.map((v) => <Tag key={v.id} map={map} view={v} focus={focus} onFocus={onFocus} small />)}
      </p>
    </section>
  );
}

const shortWho = (who) => {
  const w = String(who || '');
  return w.length > 110 ? `${w.slice(0, 107).replace(/[\s,;]+\S*$/, '')}…` : w;
};
// Who holds a view. On a live map this is the model's claim and nothing checks
// it: it named bodies that don't exist and put positions in real people's
// mouths. So it is shown only for a view that stands on at least one source,
// and it is labelled as unchecked. The ready examples were checked by hand.
const whoOf = (map, v) => (map.live && !(v.reasons || []).length ? '' : v.who || '');
const whoLabel = (map) => (map.live ? t('Said to hold it') : t('Held by'));
const countSources = (v) => new Set([...(v.reasons || []).flatMap((r) => r.sources), ...(v.sources || [])].map((s) => s.url)).size;

function useWide(query = '(min-width: 760px)') {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true);
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [query]);
  return wide;
}

// The questions they split on, one per ring. Each answer lists the views that
// give it, so the split reads straight off the list.
function Questions({ map, focus, onFocus, ring, onRing }) {
  return (
    <ol className="vd-qs">
      {map.cruxes.map((c, k) => {
        const at = (pos) => map.views.filter((v) => (c.positions[v.id] || 'mid') === pos);
        const on = ring === k;
        return (
          <li key={k} className={`vd-qi ${on ? 'on' : ''} ${ring != null && !on ? 'dim' : ''}`}>
            <button type="button" className="vd-qi-q" aria-pressed={on} onClick={() => onRing(on ? null : k)}>
              <span className="vd-qi-n">{k + 1}</span><span>{c.question}</span>
            </button>
            <ul className="vd-qi-ans">
              {[['left', 'solid', c.left], ['right', 'pale', c.right], ['mid', 'striped', t('It depends')]].map(([pos, sw, label]) => {
                const vs = at(pos);
                if (pos === 'mid' && !vs.length) return null;
                return (
                  <li key={pos}>
                    <span className="vd-qi-a"><i className={`vd-sw ${sw}`} aria-hidden="true" />{label}</span>
                    <span className="vd-qi-tags">
                      {vs.length ? vs.map((v) => <Tag key={v.id} map={map} view={v} focus={focus} onFocus={onFocus} small />) : <span className="vd-muted">{t('none of them')}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(c.reading || []).length > 0 && (
              <button type="button" className="vd-qi-read" onClick={() => onRing(k)}>
                {tp(c.reading.length, '{n} article on this question →', '{n} articles on this question →')}
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Every view, compact: what it says and who holds it. Tap to open its case.
function ViewsList({ map, focus, onFocus }) {
  return (
    <ul className="vd-vl">
      {map.views.map((v) => {
        const n = countSources(v);
        const who = whoOf(map, v);
        return (
          <li key={v.id}>
            <button type="button" className={`vd-vl-row ${focus === v.id ? 'on' : ''}`} style={{ '--c': colorOf(map, v.id) }}
              onClick={() => onFocus(focus === v.id ? null : v.id)}>
              <span className="vd-vl-bar" aria-hidden="true" />
              <span className="vd-vl-body">
                <span className="vd-vl-name">{v.name}</span>
                <span className="vd-vl-sum">{v.summary}</span>
                {who && <span className="vd-vl-who"><b>{whoLabel(map)}</b> {shortWho(who)}</span>}
                <span className="vd-vl-more">{n > 0 ? tp(n, 'Its reasons and {n} source →', 'Its reasons and {n} sources →') : t('Its case →')}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// A view's whole case: what it says, who holds it, how it answers each
// question, its reasons with the articles where they're made.
function CaseBody({ map, view, onRing }) {
  const close = closestTo(map, view.id);
  const n = map.cruxes.length;
  const reasons = view.reasons || [];
  return (
    <>
      <p className="vd-card-sum">{view.summary}</p>
      {whoOf(map, view) && (
        <p className="vd-card-who"><span>{whoLabel(map)}</span> {whoOf(map, view)}
          {map.live && <span className="vd-muted"> {t('— named by the model, not checked.')}</span>}
        </p>
      )}
      <p className="vd-card-read">{t('Its answers')}</p>
      <ol className="vd-its">
        {map.cruxes.map((c, k) => {
          const pos = c.positions[view.id] || 'mid';
          return (
            <li key={k}>
              <button type="button" className="vd-its-n" onClick={onRing ? () => onRing(k) : undefined} tabIndex={onRing ? 0 : -1}
                aria-label={t('Question {n}: {question}', { n: k + 1, question: c.question })} title={c.question}>{k + 1}</button>
              <i className={`vd-sw ${pos === 'left' ? 'solid' : pos === 'right' ? 'pale' : 'striped'}`} aria-hidden="true" />
              <span className="vd-its-a"><span className="vd-its-q">{c.question}</span>{answerText(c, pos)}</span>
            </li>
          );
        })}
      </ol>
      {reasons.length > 0 && (
        <>
          <p className="vd-card-read">{t('Its reasons, and where they’re made')}</p>
          <ol className="vd-reasons">
            {reasons.map((r, i) => (
              <li key={i}>
                <p className="vd-reason">{r.text}</p>
                {r.sources.length > 0 && <ul className="vd-srcs">{r.sources.map((s, j) => <SourceLink key={j} s={s} />)}</ul>}
              </li>
            ))}
          </ol>
        </>
      )}
      {view.sources.length > 0 && (
        <>
          <p className="vd-card-read">{t('More from people who make this case')}</p>
          <ul className="vd-srcs">{view.sources.map((s, j) => <SourceLink key={j} s={s} />)}</ul>
        </>
      )}
      {!reasons.length && !view.sources.length && <p className="vd-muted">{t('No article found yet by someone who argues this view.')}</p>}
      <ul className="vd-card-facts">
        {close && n > 0 && (close.same > 0
          ? <li><span>{t('Closest to')}</span> {t('{name}: same answer on {same} of {n}', { name: close.name, same: close.same, n })}</li>
          : <li><span>{t('Stands apart')}</span> {t('No other view shares any of its answers.')}</li>)}
        {view.changeMind && <li><span>{t('What would change its mind')}</span> {view.changeMind}</li>}
      </ul>
    </>
  );
}

function ViewDetail({ map, view, onFocus, onRing, sheet }) {
  const i = map.views.findIndex((v) => v.id === view.id);
  const prev = map.views[(i - 1 + map.views.length) % map.views.length];
  const next = map.views[(i + 1) % map.views.length];
  const ref = useRef(null);
  useEffect(() => { ref.current?.scrollTo?.({ top: 0 }); }, [view.id]);
  return (
    <div ref={ref} className={`vd-detail ${sheet ? 'sheet' : ''}`} style={{ '--c': colorOf(map, view.id) }}
      role={sheet ? 'dialog' : undefined} aria-label={view.name}>
      <div className="vd-detail-head">
        <button type="button" className="vd-detail-back" onClick={() => onFocus(null)}>{sheet ? t('Close') : t('← All views')}</button>
        <span className="vd-detail-step">{t('View {n} of {total}', { n: i + 1, total: map.views.length })}</span>
      </div>
      <h3 className="vd-detail-name">{view.name}</h3>
      <CaseBody map={map} view={view} onRing={onRing} />
      <div className="vd-detail-nav">
        <button type="button" onClick={() => onFocus(prev.id)} style={{ '--c': colorOf(map, prev.id) }}>{t('← {name}', { name: prev.short || prev.name })}</button>
        <button type="button" onClick={() => onFocus(next.id)} style={{ '--c': colorOf(map, next.id) }}>{t('{name} →', { name: next.short || next.name })}</button>
      </div>
    </div>
  );
}

function Splits({ map, focus, onFocus }) {
  return (
    <div className="vd-splits">
      {map.cruxes.map((c, i) => {
        const at = (pos) => map.views.filter((v) => c.positions[v.id] === pos);
        return (
          <article className="vd-split" key={i}>
            <h3 className="vd-split-q"><span className="vd-split-n">{i + 1}</span>{c.question}</h3>
            <div className="vd-track">
              <div className="vd-ends"><span className="vd-end">{c.left}</span><span className="vd-end mid">{t('It depends')}</span><span className="vd-end">{c.right}</span></div>
              <div className="vd-line" aria-hidden="true" />
              <div className="vd-zones">
                {['left', 'mid', 'right'].map((pos) => (
                  <div key={pos} className={`vd-zone ${pos}`} aria-label={pos === 'mid' ? t('In between') : pos === 'left' ? c.left : c.right}>
                    {at(pos).map((v) => <Tag key={v.id} map={map} view={v} focus={focus} onFocus={onFocus} />)}
                  </div>
                ))}
              </div>
            </div>
            {c.why && <p className="vd-why">{c.why}</p>}
          </article>
        );
      })}
    </div>
  );
}

function ChartCaption() {
  return (
    <div className="vd-cap">
      <p className="vd-cap-how">{t('{tap} to read the pieces on that ring’s question; a ring finds more as you open it.', { tap: <b>{t('Tap any stone')}</b> })}{' '}{t('{tap} for that view’s whole case.', { tap: <b>{t('Tap a name')}</b> })}</p>
      <p className="vd-cap-key">
        <span><b>{t('Colour')}</b> = {t('a view')}</span>
        <span><b>{t('Ring')}</b> = {t('a question, numbered from the centre')}</span>
        <span><b>{t('Filled stone')}</b> = {t('a piece arguing that answer; faint = none found yet')}</span>
        <span><b>{t('More room')}</b> = {t('the question matters more to that view')}</span>
        <span><i className="vd-sw solid" aria-hidden="true" /> {t('first answer')}</span>
        <span><i className="vd-sw pale" aria-hidden="true" /> {t('second answer')}</span>
        <span><i className="vd-sw striped" aria-hidden="true" /> {t('it depends')}</span>
      </p>
    </div>
  );
}

// Pieces kept per answer of a ring. Each is a stone on the mandala.
export const PER_SIDE = 4;

// The pieces arguing each answer of ring k: the ones the map came with, then
// any found since by a lookup (items), each page once, at most PER_SIDE an
// answer. On a live map, a page whose title argues against the answer it was
// placed under, or that cannot be anyone's argument at all (an encyclopaedia
// entry, a Q&A thread, a homework upload, a site's front page), is left out:
// the server drops both now, but maps saved before it did still hold some.
export function ringPieces(map, k, items) {
  const c = map.cruxes[k];
  const fits = (r) => !map.live || (!titleDenies(r, r.says) && !notAnArgument(r.url));
  const out = {};
  for (const pos of ['left', 'right']) {
    const seen = new Set();
    out[pos] = [...(c.reading || []), ...(items?.reading || [])]
      .filter((r) => r.side === pos && fits(r) && !seen.has(r.url) && seen.add(r.url))
      .slice(0, PER_SIDE);
  }
  return out;
}

// One ring's question: the two answers, the views that give each, and real
// articles arguing each answer. With a view picked that gives one answer, only
// that answer's side shows (Gil: "Only that side"); a view that says it
// depends, or no view, shows both.
function RingDetail({ map, k, view, onClose, onRing, onView, items, onItems }) {
  const c = map.cruxes[k];
  const mine = view ? (c.positions[view.id] || 'mid') : null;
  const only = mine === 'left' || mine === 'right' ? mine : null;
  const shown = only ? [only] : ['left', 'right'];
  // A shown side the map came with fewer than PER_SIDE pieces for: look for
  // more pieces arguing it. What's found becomes more stones on the mandala.
  const base = ringPieces(map, k, null);
  const all = ringPieces(map, k, items);
  // A ready example is complete as it stands: it was researched and read by
  // hand, so it never looks for more.
  const want = map.live ? PER_SIDE : 2;
  const short = { left: base.left.length < want, right: base.right.length < want };
  const few = shown.some((pos) => short[pos]);
  useEffect(() => { if (few && onItems) onItems(k); }, [k, few, onItems]);
  const filling = few && !!onItems;
  const looking = filling && (!items || items.loading);
  const M = map.cruxes.length;
  const sides = [['left', 'solid', c.left], ['right', 'pale', c.right]].filter(([pos]) => shown.includes(pos));
  const mids = only ? [] : map.views.filter((v) => (c.positions[v.id] || 'mid') === 'mid');
  return (
    <>
      <div className="vd-detail-head">
        <span className="vd-detail-step">{t('Ring {n} of {total}', { n: k + 1, total: M })}</span>
        <button type="button" className="vd-pop-x" onClick={onClose} aria-label={t('Close')}>{t('Close ✕')}</button>
      </div>
      <h3 className="vd-ring-q"><span className="vd-qi-n">{k + 1}</span>{c.question}</h3>
      {view && (
        <p className="vd-ring-mine">
          {t('{view} answers: {answer}.', { view: <b style={{ color: colorOf(map, view.id) }}>{view.name}</b>, answer: answerText(c, mine) })}{' '}
          <button type="button" className="vd-linkish" onClick={() => onView(view.id)}>{t('Its whole case →')}</button>
        </p>
      )}
      {c.why && <p className="vd-ring-why">{c.why}</p>}
      {sides.map(([pos, sw, label]) => {
        const items = all[pos];
        const holders = map.views.filter((v) => c.positions[v.id] === pos);
        return (
          <section key={pos} className={`vd-side ${mine === pos ? 'mine' : ''}`}>
            <p className="vd-side-h"><i className={`vd-sw ${sw}`} aria-hidden="true" />{label}{mine === pos && <span className="vd-side-mine">{t('its answer')}</span>}</p>
            {holders.length > 0 && (
              <p className="vd-side-who">{t('Views here:')} {holders.map((v) => (
                <button key={v.id} type="button" className="vd-tag small" style={{ '--c': colorOf(map, v.id) }} onClick={() => onView(v.id)}>{v.short || v.name}</button>
              ))}</p>
            )}
            {items.length ? (
              <ul className="vd-read">
                {items.map((s, j) => (
                  <li key={j}>
                    {s.says && <p className="vd-read-says">{typeLabel(s) && <span className="vd-ritem-type">{typeLabel(s)}</span>}{s.says}</p>}
                    <ul className="vd-srcs"><SourceLink s={s} /></ul>
                  </li>
                ))}
              </ul>
            ) : null}
            {filling && short[pos] && looking && <p className="vd-muted">{t('Finding pieces that argue this…')}</p>}
            {!items.length && !(filling && looking) && <p className="vd-muted">{filling ? t('Nothing found arguing this yet.') : t('No checked article on this side yet.')}</p>}
          </section>
        );
      })}
      {mids.length > 0 && (
        <p className="vd-side-mid"><i className="vd-sw striped" aria-hidden="true" />{t('It depends:')} {mids.map((v) => (
          <button key={v.id} type="button" className="vd-tag small" style={{ '--c': colorOf(map, v.id) }} onClick={() => onView(v.id)}>{v.short || v.name}</button>
        ))}</p>
      )}
      {filling && items && !items.loading && (items.error || shown.some((pos) => short[pos] && !all[pos].length)) && (
        <p className="vd-muted">{items.error ? t('Couldn’t look for pieces just now.') : (only ? t('Nothing turned up for this answer.') : t('Nothing turned up for one of the answers.'))}{' '}
          <button type="button" className="vd-linkish" onClick={() => onItems(k, { retry: true })}>{t('Try again')}</button></p>
      )}
      <div className="vd-detail-nav">
        <button type="button" onClick={() => onRing((k - 1 + M) % M)}>{t('← Question {n}', { n: ((k - 1 + M) % M) + 1 })}</button>
        <button type="button" onClick={() => onRing((k + 1) % M)}>{t('Question {n} →', { n: ((k + 1) % M) + 1 })}</button>
      </div>
    </>
  );
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, Math.max(lo, hi)));

// A ring's articles, popping out of the tile that was tapped, with a pointer
// back to it. Beside the tile on a laptop, just under it on a phone.
function RingPop({ map, k, view, chartRef, wide, onClose, onRing, onView, items, onItems }) {
  const boxRef = useRef(null);
  const inRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [ax, ay] = anchorPoint(map, view?.id, k);
  useLayoutEffect(() => {
    const place = () => {
      const col = chartRef.current, box = boxRef.current;
      const svg = col?.querySelector('.vd-mm-svg');
      const m = svg?.getScreenCTM?.();
      if (!col || !box || !m) return;
      const p = new DOMPoint(ax, ay).matrixTransform(m); // where the tile is, on screen
      const cr = col.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      // Narrow: as wide as the chart's column (a few px past it), never past
      // the page's own width, so a scrollbar never pushes it wider.
      box.style.width = wide ? '' : `${Math.min(vw - 24, cr.width + 8)}px`;
      const W = box.offsetWidth, H = box.offsetHeight;
      if (wide) {
        // Just outside the mandala's rim, so the tile stays in view, with a
        // line running from the tile to the pop-up's pointer.
        const centre = new DOMPoint(0, 0).matrixTransform(m);
        const side = p.x >= centre.x - 1 ? 'right' : 'left';
        const rim = new DOMPoint(side === 'right' ? 140 : -140, 0).matrixTransform(m).x;
        const left = clamp(side === 'right' ? rim + 18 : rim - 18 - W, 12, vw - 12 - W);
        const top = clamp(p.y - 60, 12, vh - 12 - H);
        const a = clamp(p.y - top, 22, H - 22);
        const tipX = side === 'right' ? left - 10 : left + W + 10;
        setPos({ side, left: left - cr.left, top: top - cr.top, a,
          line: { x1: p.x - cr.left, y1: p.y - cr.top, x2: tipX - cr.left, y2: top + a - cr.top } });
      } else {
        const left = clamp(cr.left - 4, 12, vw - 12 - W);
        setPos({ side: 'below', left: left - cr.left, top: p.y + 14 - cr.top, a: clamp(p.x - left, 22, W - 22) });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [k, view?.id, wide, ax, ay, chartRef]);
  useEffect(() => {
    inRef.current?.scrollTo?.({ top: 0 });
    if (!pos) return;
    boxRef.current?.focus({ preventScroll: true });
    if (!wide) boxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pos?.top, pos?.left, k, view?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const away = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (e.target.closest?.('button, a, input, summary, [role="button"]')) return;
      onClose();
    };
    window.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', away);
    return () => { window.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', away); };
  }, [onClose]);
  const c = map.cruxes[k];
  const style = { '--c': view ? colorOf(map, view.id) : 'var(--vd-ink)', '--a': `${pos?.a ?? 40}px` };
  if (pos) { style.left = pos.left; style.top = pos.top; } else { style.visibility = 'hidden'; style.left = 0; style.top = 0; }
  return (
    <>
      {pos?.line && (
        <svg className="vd-pop-line" aria-hidden="true" style={{ '--c': style['--c'] }}>
          <line {...pos.line} />
        </svg>
      )}
      <div ref={boxRef} className={`vd-pop ${pos?.side || ''}`} style={style} role="dialog" tabIndex={-1}
        aria-label={t('Question {n}: {question}', { n: k + 1, question: c.question })} key={`${k}-${view?.id || ''}`}>
        <div ref={inRef} className="vd-pop-in vd-detail vd-ring">
          <RingDetail map={map} k={k} view={view} onClose={onClose} onRing={onRing} onView={onView} items={items} onItems={onItems} />
        </div>
      </div>
    </>
  );
}

// embedded: shown inside the app on a thread's page, under the thread's own
// question, so it skips repeating the question and keeps the one-column layout.
// ringItems(k) / onRingItems(k): pieces arguing each answer of a ring with too
// few checked articles, kept on the thread. Without them (the standalone page)
// they're looked up here and kept for as long as the page is open.
export function Result({ map, embedded = false, ringItems = null, onRingItems = null }) {
  useLang(); // re-render when the interface language changes
  const [localRings, setLocalRings] = useState({});
  const localRef = useRef({ key: '', rings: {} });
  const [focus, setFocus] = useState(null);
  const [ring, setRing] = useState(null);
  const [show, setShow] = useState(null); // 'view' or 'ring': what the panel or sheet shows
  const [tab, setTab] = useState('views');
  const wideScreen = useWide();
  const wide = embedded ? false : wideScreen;
  const chartRef = useRef(null);
  // Start fresh for another map, not when the same map is saved again (a
  // thread re-reads it whenever anything on the thread changes).
  const mapKey = `${map.question}|${map.views.map((v) => v.id).join(',')}|${map.cruxes.map((c) => c.question).join('|')}`;
  useEffect(() => { setFocus(null); setRing(null); setShow(null); }, [mapKey]);
  const loadLocal = React.useCallback(async (k, { retry = false } = {}) => {
    const store = localRef.current;
    if (store.key !== mapKey) { store.key = mapKey; store.rings = {}; }
    const have = store.rings[k];
    if (have && (have.loading || !retry)) return;
    const put = (entry) => { if (store.key === mapKey) { store.rings = { ...store.rings, [k]: entry }; setLocalRings(store.rings); } };
    put({ loading: true });
    try { put(await fetchRingSides(map, k)); } catch (e) { put({ reading: [], error: String(e?.message || e).slice(0, 200) }); }
  }, [mapKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const getItems = ringItems || ((k) => (localRef.current.key === mapKey ? localRings[k] : null) || null);
  const loadItems = onRingItems || (embedded ? null : loadLocal);
  const closeAll = () => { setFocus(null); setRing(null); setShow(null); };
  const ringOpen = show === 'ring' && ring != null;
  const viewOpen = show === 'view' && !!focus;
  // Closing a ring's pop-up keeps the view that was tapped highlighted.
  const closeRing = React.useCallback(() => { setRing(null); setShow(null); }, []);
  useEffect(() => {
    if (!viewOpen || wide) return;
    const esc = (e) => { if (e.key === 'Escape') closeAll(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [viewOpen, wide]);
  // On a thread page, the side column's list of questions opens a ring here.
  useEffect(() => {
    if (!embedded) return undefined;
    const open = (e) => { if (e.detail?.question === map.question && map.cruxes[e.detail.k]) { setRing(e.detail.k); setShow('ring'); } };
    window.addEventListener('mosaic:views-ring', open);
    return () => window.removeEventListener('mosaic:views-ring', open);
  }, [embedded, mapKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // A view's case: tap its name, its row or its tag.
  const pickView = (id) => { setFocus(id); setRing(null); setShow(id ? 'view' : null); };
  // A question: tap its ring number or its card.
  const pickRing = (k) => { setRing(k); setShow(k == null ? null : 'ring'); };
  // A cell: that view on that question.
  const pickCell = (id, k) => { setFocus(id); setRing(k); setShow('ring'); };
  // Tags in the question list only highlight; they don't open anything.
  const sources = SOURCE_COUNT(map);
  const mapped = map.status === 'mapped';
  const fv = map.views.find((v) => v.id === focus);

  if (!mapped) {
    return (
      <div className="vd-result">
        <h1 className="vd-q">{map.question}</h1>
        <p className="vd-empty">{map.thin
          ? t('People do disagree on this, but I couldn’t find enough articles from each side to show it properly. Try wording it another way, or open a ready example.')
          : t('This doesn’t look like something people hold public views on, so there are no sides to map.')}</p>
      </div>
    );
  }

  const questions = (
    <>
      <Questions map={map} focus={focus} onFocus={setFocus} ring={ring} onRing={pickRing} />
      <Wording map={map} focus={focus} onFocus={setFocus} />
    </>
  );
  const detail = (sheet) => (viewOpen ? <ViewDetail map={map} view={fv} onFocus={pickView} onRing={pickRing} sheet={sheet} /> : null);

  return (
    <div className="vd-result">
      <div className="vd-stage">
        <div className="vd-stage-head">
          <p className="vd-kicker">{map.live ? t('Mapped just now') : t('Ready example')} · {t('{n} views', { n: map.views.length })} · {t('{n} questions they split on', { n: map.cruxes.length })}{sources > 0
            ? ` · ${map.live ? t('{n} sources found by search, each opened to check it loads', { n: sources }) : t('{n} sources, each opened and read', { n: sources })}`
            : ''}</p>
          {!embedded && <h1 className="vd-q">{map.question}</h1>}
          {map.headline && <p className="vd-headline">{map.headline}</p>}
        </div>

        {wide && (
          <aside className="vd-col vd-col-key" aria-labelledby="vd-key-h">
            <h2 id="vd-key-h" className="vd-col-h">{t('The {n} questions they split on', { n: map.cruxes.length })}</h2>
            <p className="vd-col-sub">{t('One per ring. Tap one for real articles on each side of it.')}</p>
            {questions}
          </aside>
        )}

        <div className="vd-col-chart" ref={chartRef}>
          <DemoMandala map={map} focus={focus} onFocus={pickView} ring={ring} onRing={pickRing} onCell={pickCell} colorOf={colorOf}
            mark={ringOpen && fv ? anchorPoint(map, fv.id, ring) : null}
            pieces={map.cruxes.map((_, k) => ringPieces(map, k, getItems(k)))} />
          <ChartCaption />
          {ringOpen && (
            <RingPop map={map} k={ring} view={fv} chartRef={chartRef} wide={wide} onClose={closeRing} onRing={pickRing} onView={pickView}
              items={getItems(ring)} onItems={loadItems} />
          )}
        </div>

        {wide ? (
          <aside className="vd-col vd-col-panel" aria-live="polite">
            {viewOpen ? detail(false) : (
              <>
                <h2 className="vd-col-h">{t('The {n} main views', { n: map.views.length })}</h2>
                <p className="vd-col-sub">{t('Tap one to see its reasons and sources.')}</p>
                <ViewsList map={map} focus={focus} onFocus={pickView} />
              </>
            )}
          </aside>
        ) : (
          <div className="vd-tabs-wrap">
            <div className="vd-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'views'} onClick={() => setTab('views')}>{t('The {n} views', { n: map.views.length })}</button>
              <button type="button" role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}>{t('The {n} questions', { n: map.cruxes.length })}</button>
            </div>
            <div role="tabpanel">
              {tab === 'views' ? <ViewsList map={map} focus={focus} onFocus={pickView} /> : questions}
            </div>
          </div>
        )}
      </div>

      {!wide && viewOpen && (
        <>
          <div className="vd-scrim" onClick={closeAll} aria-hidden="true" />
          {detail(true)}
        </>
      )}

      <details className="vd-more">
        <summary>{t('Each question as a line, with every view placed on it')}</summary>
        <Splits map={map} focus={focus} onFocus={setFocus} />
      </details>
      <details className="vd-more">
        <summary>{t('Every view’s full case, one after another')}</summary>
        <div className="vd-cards">
          {map.views.map((v) => (
            <article key={v.id} className="vd-card" style={{ '--c': colorOf(map, v.id) }} id={`view-${v.id}`}>
              <header><h3>{v.name}</h3></header>
              <CaseBody map={map} view={v} />
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

const STEPS = () => [t('Finding the main views and who holds them'), t('Working out the points they split on'), t('Searching for articles by people who hold each view'), t('Opening every link to check it')];
const STEP_COUNT = 4;

export function Working() {
  useLang();
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI((n) => Math.min(n + 1, STEP_COUNT - 1)), 6000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="vd-working" aria-live="polite">
      <ol>
        {STEPS().map((s, k) => <li key={k} className={k < i ? 'done' : k === i ? 'now' : ''}>{s}</li>)}
      </ol>
      <p className="vd-muted">{t('Usually 20 to 40 seconds for a new question.')}</p>
    </div>
  );
}

export default function ViewsPage() {
  useLang();
  const init = readUrl();
  const initialEx = init.q ? null : (EXAMPLES.find((e) => e.id === init.ex) || EXAMPLES[0]);
  const [map, setMap] = useState(initialEx);
  const [exId, setExId] = useState(initialEx?.id || null);
  const [text, setText] = useState(init.q || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(null);
  const resultRef = useRef(null);

  useEffect(() => {
    fetch('/api/views-demo').then((r) => r.json()).then((j) => setLive(!!j.live)).catch(() => setLive(false));
    if (init.q) ask(init.q);
  }, []);

  const scrollToResult = () => setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);

  const openExample = (ex) => {
    setError(null); setBusy(false); setMap(ex); setExId(ex.id); setText('');
    writeUrl({ ex: ex.id });
  };

  async function ask(q) {
    const question = String(q || '').trim();
    if (question.length < 6) { setError(t('Type a question first, like “Should cities ban cars downtown?”')); return; }
    const ex = exampleFor(question);
    if (ex) { openExample(ex); return; }
    setBusy(true); setError(null); setExId(null); setMap(null);
    writeUrl({ q: question });
    scrollToResult();
    try {
      let res, j;
      for (let i = 0; i < 4; i++) {
        res = await fetch('/api/views-demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
        j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.pending) break;
      }
      if (!res.ok) throw new Error(j?.error?.message || t('Something went wrong ({status}).', { status: res.status }));
      if (j?.pending) throw new Error(t('The mapping model is busy just now. Try again in a minute.'));
      setMap(j);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e) => { e.preventDefault(); ask(text); };

  return (
    <div className="vd">
      <header className="vd-bar">
        <p className="vd-bar-brand"><span className="vd-brand"><Icon name="mosaic" size={20} className="vd-brand-ic" />{t('Mosaic')}<span className="vd-brand-sub">{t('Views')}</span></span></p>
        <p className="vd-bar-tag">{t('Every side of a question, who holds it, and their sources. Never a verdict.')}</p>
      </header>

      <nav className="vd-pick" aria-label={t('Pick a question')}>
        <div className="vd-examples" role="list" aria-label={t('Ready examples')}>
          {EXAMPLES.map((ex) => (
            <button key={ex.id} role="listitem" className={`vd-ex ${exId === ex.id ? 'on' : ''}`} onClick={() => openExample(ex)} aria-pressed={exId === ex.id}>
              {ex.question}
            </button>
          ))}
        </div>
        <form className="vd-ask" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Or ask your own question')} aria-label={t('Your question')} maxLength={300} enterKeyHint="go" />
          <button type="submit" disabled={busy}>{busy ? t('Mapping…') : t('Map it')}</button>
        </form>
        {live === false && <p className="vd-note">{t('Typed questions aren’t switched on in this version yet. The ready examples are complete.')}</p>}
      </nav>

      <main ref={resultRef} className="vd-main">
        {busy && <Working />}
        {error && !busy && (
          <div className="vd-error" role="alert">
            <p>{error}</p>
            <p className="vd-muted">{t('Try one of the ready examples above in the meantime.')}</p>
          </div>
        )}
        {map && !busy && <Result map={map} />}
        {map?.status === 'none' && map.nearby?.length > 0 && (
          <div className="vd-nearby">
            <p>{t('Questions near it that people do hold different views on:')}</p>
            {map.nearby.map((q) => <button key={q} className="vd-ex small" onClick={() => { setText(q); ask(q); }}>{q}</button>)}
          </div>
        )}
      </main>

      <footer className="vd-foot">
        {map && !map.live
          ? <p>{t('This example was researched in {date}. Every link was opened and read to confirm it says what it’s cited for. Each view is summarised the way its own holders put it, and none is marked right or wrong.', { date: !map.preparedOn || map.preparedOn === 'November 2026' ? t('November 2026') : map.preparedOn })}</p>
          : <p>{t('A typed question is mapped by AI from live web search. It only links pages it actually found, and opens each one to check it loads. It doesn’t pick a side, so read the sources themselves.')}</p>}
      </footer>
    </div>
  );
}
