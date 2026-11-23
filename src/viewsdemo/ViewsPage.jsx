// The public views page (/views). Ask a question and see, at a glance, the
// main views on it, who holds each, the exact points they split on (each view
// placed on a line between two answers), and each view's reasons with real
// articles by people who hold it. It never rules on the question. Ready-made examples load instantly;
// a typed question is mapped live by /api/views-demo when it's switched on.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLES, exampleFor } from './examples.js';
import { closestTo, SOURCE_COUNT, hostOf } from '../engine/viewsDemo.js';

const COLORS = ['#1f6f6a', '#b4432c', '#4b4f9e', '#9a6a12'];
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
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

function SourceLink({ s, withQuote = true }) {
  return (
    <li className="vd-src">
      <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title || hostOf(s.url)}<span aria-hidden="true"> ↗</span></a>
      <span className="vd-src-meta">{[s.author, s.outlet || hostOf(s.url), fmtDate(s.date)].filter(Boolean).join(' · ')}</span>
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
    <section className="vd-wording" aria-label="How the question is worded">
      <span className="vd-wording-label">Notice the wording</span>
      <p>{w.assumes}{away.length > 0 && ' Views that reject that framing: '}
        {away.map((v) => <Tag key={v.id} map={map} view={v} focus={focus} onFocus={onFocus} small />)}
      </p>
    </section>
  );
}

const nameList = (vs) => vs.map((v) => v.name).reduce((acc, n, i, arr) => acc + (i === 0 ? '' : i === arr.length - 1 ? ' and ' : ', ') + n, '');
const shortWho = (who) => {
  const first = String(who || '').split(/;\s/)[0];
  return first.length > 120 ? `${first.slice(0, 117).replace(/[\s,]+\S*$/, '')}…` : first;
};

// Every view in a line, at the top: what it says, who holds it, and a clear
// button to highlight it everywhere on the page.
function Overview({ map, focus, onFocus }) {
  return (
    <section className="vd-block" aria-labelledby="vd-overview-h">
      <h2 id="vd-overview-h">The {map.views.length} main views</h2>
      <p className="vd-block-sub">What people actually hold on this, and who holds it. Pick one to highlight it everywhere below.</p>
      <ol className="vd-overview">
        {map.views.map((v) => {
          const on = focus === v.id;
          return (
            <li key={v.id} className={`vd-ov ${on ? 'on' : ''} ${focus && !on ? 'dim' : ''}`} style={{ '--c': colorOf(map, v.id) }}>
              <span className="vd-ov-swatch" aria-hidden="true" />
              <div className="vd-ov-body">
                <h3 className="vd-ov-name">{v.name}</h3>
                <p className="vd-ov-sum">{v.summary}</p>
                {v.who && <p className="vd-ov-who"><span>Held by</span> {shortWho(v.who)}</p>}
                <div className="vd-ov-actions">
                  <button type="button" className="vd-ov-pick" aria-pressed={on} onClick={() => onFocus(on ? null : v.id)}>
                    {on ? '✓ Highlighted' : 'Highlight this view'}
                  </button>
                  <a className="vd-ov-more" href={`#view-${v.id}`}>Its full case ↓</a>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FocusBar({ map, focus, onFocus }) {
  const v = map.views.find((x) => x.id === focus);
  if (!v) return null;
  return (
    <div className="vd-focusbar" role="status" style={{ '--c': colorOf(map, v.id) }}>
      <span className="vd-focusbar-dot" aria-hidden="true" />
      <span className="vd-focusbar-text">Highlighting <b>{v.name}</b></span>
      <button type="button" onClick={() => onFocus(null)}>Show all views</button>
    </div>
  );
}

function Splits({ map, focus, onFocus }) {
  const first = map.cruxes[0];
  const sideOf = (c, pos) => map.views.filter((v) => c.positions[v.id] === pos);
  const answerOf = (c, id) => (c.positions[id] === 'left' ? c.left : c.positions[id] === 'right' ? c.right : 'It depends, or in between');
  const fv = map.views.find((v) => v.id === focus);
  return (
    <section className="vd-block" aria-labelledby="vd-splits-h">
      <h2 id="vd-splits-h">Where they split</h2>
      <p className="vd-block-sub">The views don’t just “disagree”. They answer a few specific questions differently, and these are those questions.</p>
      <div className="vd-howto">
        <p className="vd-howto-title">How to read it</p>
        <ul>
          <li>Each box is <b>one question</b> the views answer differently.</li>
          <li>The line runs between <b>two opposite answers</b>, one at each end. Each coloured tag is a view, placed at its answer. A tag in the middle means “it depends”.</li>
          <li>Tags on the <b>same side agree</b> on that question. Tags at <b>opposite ends</b> are where the real disagreement is.</li>
        </ul>
        {first && sideOf(first, 'left').length > 0 && sideOf(first, 'right').length > 0 && (
          <p className="vd-howto-eg">
            For example, on question 1, {nameList(sideOf(first, 'left'))} {sideOf(first, 'left').length > 1 ? 'answer' : 'answers'} “{first.left}”, while {nameList(sideOf(first, 'right'))} {sideOf(first, 'right').length > 1 ? 'answer' : 'answers'} “{first.right}”.
          </p>
        )}
        <p className="vd-howto-tip">Tap any tag to highlight that view on every question.</p>
      </div>
      <div className="vd-splits">
        {map.cruxes.map((c, i) => {
          const at = (pos) => map.views.filter((v) => c.positions[v.id] === pos);
          return (
            <article className="vd-split" key={i}>
              <h3 className="vd-split-q"><span className="vd-split-n">{i + 1}</span>{c.question}</h3>
              <div className="vd-track">
                <div className="vd-ends"><span className="vd-end">{c.left}</span><span className="vd-end mid">It depends</span><span className="vd-end">{c.right}</span></div>
                <div className="vd-line" aria-hidden="true" />
                <div className="vd-zones">
                  {['left', 'mid', 'right'].map((pos) => (
                    <div key={pos} className={`vd-zone ${pos}`} aria-label={pos === 'mid' ? 'In between' : pos === 'left' ? c.left : c.right}>
                      {at(pos).map((v) => <Tag key={v.id} map={map} view={v} focus={focus} onFocus={onFocus} />)}
                    </div>
                  ))}
                </div>
              </div>
              {fv && <p className="vd-split-mine" style={{ '--c': colorOf(map, fv.id) }}><b>{fv.name}</b> answers: {answerOf(c, fv.id)}</p>}
              {c.why && <p className="vd-why">{c.why}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ViewCard({ map, view, focus, onFocus }) {
  const close = closestTo(map, view.id);
  const n = map.cruxes.length;
  const dim = focus && focus !== view.id;
  const reasons = view.reasons || [];
  return (
    <article className={`vd-card ${dim ? 'dim' : ''} ${focus === view.id ? 'on' : ''}`} style={{ '--c': colorOf(map, view.id) }} id={`view-${view.id}`}>
      <header>
        <Tag map={map} view={view} focus={focus} onFocus={onFocus} small />
        <h3>{view.name}</h3>
      </header>
      <p className="vd-card-sum">{view.summary}</p>
      {view.who && <p className="vd-card-who"><span>Held by</span> {view.who}</p>}
      {reasons.length > 0 && (
        <>
          <p className="vd-card-read">Its reasons, and where they’re made</p>
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
          <p className="vd-card-read">More from people who make this case</p>
          <ul className="vd-srcs">{view.sources.map((s, j) => <SourceLink key={j} s={s} />)}</ul>
        </>
      )}
      {!reasons.length && !view.sources.length && <p className="vd-muted">No article found yet by someone who argues this view.</p>}
      <ul className="vd-card-facts">
        {close && n > 0 && (close.same > 0
          ? <li><span>Closest to</span> {close.name}: same answer on {close.same} of {n}</li>
          : <li><span>Stands apart</span> No other view shares any of its answers.</li>)}
        {view.changeMind && <li><span>What would change its mind</span> {view.changeMind}</li>}
      </ul>
    </article>
  );
}

function Result({ map }) {
  const [focus, setFocus] = useState(null);
  useEffect(() => setFocus(null), [map]);
  const sources = SOURCE_COUNT(map);
  const mapped = map.status === 'mapped';
  return (
    <div className="vd-result">
      <p className="vd-kicker">{map.live ? 'Mapped just now' : 'Ready example'}</p>
      <h1 className="vd-q">{map.question}</h1>
      {map.headline && <p className="vd-headline">{map.headline}</p>}
      {mapped && (
        <ul className="vd-stats" aria-label="At a glance">
          <li><b>{map.views.length}</b> main views</li>
          <li><b>{map.cruxes.length}</b> points they split on</li>
          {sources > 0 && <li><b>{sources}</b> real sources, each opened and checked</li>}
        </ul>
      )}
      {mapped && (
        <>
          <Overview map={map} focus={focus} onFocus={setFocus} />
          <Wording map={map} focus={focus} onFocus={setFocus} />
          <Splits map={map} focus={focus} onFocus={setFocus} />
          <section className="vd-block" aria-labelledby="vd-views-h">
            <h2 id="vd-views-h">Each view’s full case</h2>
            <p className="vd-block-sub">Its reasons in its own terms, each with the article where it’s made.</p>
            <div className="vd-cards">
              {map.views.map((v) => <ViewCard key={v.id} map={map} view={v} focus={focus} onFocus={setFocus} />)}
            </div>
          </section>
          <FocusBar map={map} focus={focus} onFocus={setFocus} />
        </>
      )}
      {map.status === 'none' && (
        <p className="vd-empty">This doesn’t look like something people hold public views on, so there are no sides to map.</p>
      )}
    </div>
  );
}

const STEPS = ['Finding the main views and who holds them', 'Working out the points they split on', 'Searching for articles by people who hold each view', 'Opening every link to check it'];

function Working() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="vd-working" aria-live="polite">
      <ol>
        {STEPS.map((s, k) => <li key={k} className={k < i ? 'done' : k === i ? 'now' : ''}>{s}</li>)}
      </ol>
      <p className="vd-muted">Usually 20 to 40 seconds for a new question.</p>
    </div>
  );
}

export default function ViewsPage() {
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
    scrollToResult();
  };

  async function ask(q) {
    const question = String(q || '').trim();
    if (question.length < 6) { setError('Type a question first, like “Should cities ban cars downtown?”'); return; }
    const ex = exampleFor(question);
    if (ex) { openExample(ex); return; }
    setBusy(true); setError(null); setExId(null); setMap(null);
    writeUrl({ q: question });
    scrollToResult();
    try {
      const res = await fetch('/api/views-demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error?.message || `Something went wrong (${res.status}).`);
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
      <header className="vd-top">
        <span className="vd-brand">Mosaic</span>
        <span className="vd-brand-sub">Views</span>
      </header>

      <section className="vd-hero">
        <h1 className="vd-title">See every side of a question</h1>
        <p className="vd-lede">Ask about something people disagree on. Mosaic lays out the main views, who holds each one, the exact points they split on, and real articles from the people who make each case. It never picks a side: you read the sources and decide.</p>
        <form className="vd-ask" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question, e.g. Should cities ban cars downtown?" aria-label="Your question" maxLength={300} enterKeyHint="go" />
          <button type="submit" disabled={busy}>{busy ? 'Mapping…' : 'Map it'}</button>
        </form>
        {live === false && <p className="vd-note">Typed questions aren’t switched on in this version yet. The ready examples below are complete.</p>}
        <div className="vd-examples" role="list" aria-label="Ready examples">
          {EXAMPLES.map((ex) => (
            <button key={ex.id} role="listitem" className={`vd-ex ${exId === ex.id ? 'on' : ''}`} onClick={() => openExample(ex)}>
              <span className="vd-ex-q">{ex.question}</span>
              <span className="vd-ex-meta">{ex.views.length} views · {SOURCE_COUNT(ex)} sources</span>
            </button>
          ))}
        </div>
      </section>

      <main ref={resultRef} className="vd-main">
        {busy && <Working />}
        {error && !busy && (
          <div className="vd-error" role="alert">
            <p>{error}</p>
            <p className="vd-muted">Try one of the ready examples above in the meantime.</p>
          </div>
        )}
        {map && !busy && <Result map={map} />}
        {map?.status === 'none' && map.nearby?.length > 0 && (
          <div className="vd-nearby">
            <p>Questions near it that people do hold different views on:</p>
            {map.nearby.map((q) => <button key={q} className="vd-ex small" onClick={() => { setText(q); ask(q); }}>{q}</button>)}
          </div>
        )}
      </main>

      <footer className="vd-foot">
        {map && !map.live
          ? <p>This example was researched in {map.preparedOn || 'November 2026'}. Every link was opened and read to confirm it says what it’s cited for. Each view is summarised the way its own holders put it, and none is marked right or wrong.</p>
          : <p>A typed question is mapped by AI from live web search. It only links pages it actually found, and opens each one to check it loads. It doesn’t pick a side, so read the sources themselves.</p>}
      </footer>
    </div>
  );
}
