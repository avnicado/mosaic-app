// The public views page (/views). Ask a contested question and see, at a
// glance: what the evidence settles, the main views, the exact points they
// split on (each view placed on a line between two answers), and real
// articles by people who hold each view. Ready-made examples load instantly;
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

function Settled({ map }) {
  if (!map.settled.length) return null;
  return (
    <section className="vd-block vd-settled" aria-labelledby="vd-settled-h">
      <h2 id="vd-settled-h"><span className="vd-check" aria-hidden="true">✓</span> What the evidence settles</h2>
      <p className="vd-block-sub">Not up for debate among the views below. Strong sources, not opinion.</p>
      <ul className="vd-facts">
        {map.settled.map((f, i) => (
          <li key={i}>
            <p className="vd-fact">{f.text}</p>
            {f.sources.length > 0 && <ul className="vd-srcs inline">{f.sources.map((s, j) => <SourceLink key={j} s={s} withQuote={false} />)}</ul>}
          </li>
        ))}
      </ul>
    </section>
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

function Splits({ map, focus, onFocus }) {
  return (
    <section className="vd-block" aria-labelledby="vd-splits-h">
      <h2 id="vd-splits-h">Where they split</h2>
      <p className="vd-block-sub">Each coloured tag is one of the main views. Its place on the line shows how that view answers the question. Tap a tag to follow one view.</p>
      <ul className="vd-legend" aria-label="The main views">
        {map.views.map((v) => (
          <li key={v.id}><Tag map={map} view={v} focus={focus} onFocus={onFocus} small /><span>{v.name}</span></li>
        ))}
      </ul>
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
  return (
    <article className={`vd-card ${dim ? 'dim' : ''} ${focus === view.id ? 'on' : ''}`} style={{ '--c': colorOf(map, view.id) }} id={`view-${view.id}`}>
      <header>
        <Tag map={map} view={view} focus={focus} onFocus={onFocus} small />
        <h3>{view.name}</h3>
      </header>
      <p className="vd-card-sum">{view.summary}</p>
      {view.who && <p className="vd-card-who"><span>Held by</span> {view.who}</p>}
      <ul className="vd-card-facts">
        {close && n > 0 && <li><span>Closest to</span> {close.name}: same answer on {close.same} of {n}</li>}
        {view.changeMind && <li><span>What would change its mind</span> {view.changeMind}</li>}
      </ul>
      {view.sources.length > 0 ? (
        <>
          <p className="vd-card-read">Read the case, from people who make it</p>
          <ul className="vd-srcs">{view.sources.map((s, j) => <SourceLink key={j} s={s} />)}</ul>
        </>
      ) : (
        <p className="vd-muted">No article found yet by someone who argues this view.</p>
      )}
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
          {map.settled.length > 0 && <li><b>{map.settled.length}</b> settled {map.settled.length === 1 ? 'fact' : 'facts'}</li>}
          <li><b>{map.views.length}</b> main views</li>
          <li><b>{map.cruxes.length}</b> points they split on</li>
          {sources > 0 && <li><b>{sources}</b> real sources, each opened and checked</li>}
        </ul>
      )}
      <Settled map={map} />
      {mapped && (
        <>
          <Wording map={map} focus={focus} onFocus={setFocus} />
          <Splits map={map} focus={focus} onFocus={setFocus} />
          <section className="vd-block" aria-labelledby="vd-views-h">
            <h2 id="vd-views-h">The views, in their own words</h2>
            <div className="vd-cards">
              {map.views.map((v) => <ViewCard key={v.id} map={map} view={v} focus={focus} onFocus={setFocus} />)}
            </div>
          </section>
        </>
      )}
      {map.status === 'settled' && (
        <p className="vd-empty">No live public argument turned up around this one: the evidence answers it.</p>
      )}
      {map.status === 'none' && (
        <p className="vd-empty">This doesn’t look like something people argue about in public, so there are no sides to map.</p>
      )}
    </div>
  );
}

const STEPS = ['Finding where people really disagree', 'Separating settled facts from live arguments', 'Searching for articles by people who hold each view', 'Opening every link to check it'];

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
        <h1 className="vd-title">See where people really disagree</h1>
        <p className="vd-lede">Ask about a contested issue. Mosaic separates what the evidence settles from what people actually argue about, shows the exact points the main views split on, and links real articles from people who hold each one.</p>
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
            <p>Questions near it that people do argue about:</p>
            {map.nearby.map((q) => <button key={q} className="vd-ex small" onClick={() => { setText(q); ask(q); }}>{q}</button>)}
          </div>
        )}
      </main>

      <footer className="vd-foot">
        {map && !map.live
          ? <p>This example was researched in {map.preparedOn || 'November 2026'}. Every link was opened and read to confirm it says what it’s cited for. Views are summarised fairly, the way their own holders put them.</p>
          : <p>A typed question is mapped by AI from live web search. It only links pages it actually found, and opens each one to check it loads. Read the sources themselves.</p>}
      </footer>
    </div>
  );
}
