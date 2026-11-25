import React, { useEffect, useRef, useState } from 'react';
import * as R from '../../data/record.js';
import { useRecord } from '../../data/hooks.js';
import { RATING_AXES } from '../kit.jsx';
import './settings.css';
import { isOwner } from '../../session.js';
import { FeedbackInbox } from '../feedback/Feedback.jsx';
import { t, tp, loc, LANGUAGES, useLang, setLang } from '../../i18n/index.js';

const DAY = 864e5;
const DURATIONS = [1, 3, 6, 12];
const fmt = (ts) => new Date(ts).toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: 'numeric' });
const addMonths = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); };

// Accepts the old demo's pledge ({bar: n, months, startedAt}) as well as the app's.
function normalizePledge(p) {
  if (!p) return null;
  let bar = p.bar;
  if (typeof bar === 'number') bar = { profound: bar, ethical: bar };
  bar = Object.fromEntries(Object.entries(bar || {}).filter(([, v]) => typeof v === 'number'));
  const startedAt = p.startedAt || Date.now();
  const endsAt = p.endsAt || (p.months ? addMonths(startedAt, p.months) : null);
  return { ...p, bar, startedAt, endsAt };
}

export default function Settings() {
  return (
    <div className="page set">
      <div className="eyebrow">{t('Settings')}</div>
      <h1>{t('Settings')}</h1>
      <Sync />
      <Language />
      {isOwner() && <People />}
      {isOwner() && <FeedbackInbox />}
      <Backup />
      <Ratings />
      <Pledge />
      <Danger />
    </div>
  );
}

// ---- sync --------------------------------------------------------------------------
function useSession() {
  const [s, setS] = useState({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fetch('/api/session', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((j) => live && setS({ state: 'ok', ...j }))
      .catch(() => live && setS({ state: 'down' }));
    return () => { live = false; };
  }, []);
  return s;
}

function Sync() {
  const s = useSession();
  let head, body;
  if (s.state === 'loading') { head = t('Checking…'); body = null; }
  else if (s.state === 'down') { head = t('Can’t reach the server'); body = t('Changes stay on this device and are sent when the connection is back.'); }
  else if (s.store === 'none') { head = t('Only on this device'); body = t('This server has no storage set up, so your record lives in this browser alone. Export it to keep a copy.'); }
  else { head = t('Saved to your server'); body = s.store === 'file' ? t('Every change is sent to your server (a local file, in development), so the record is the same on each device you sign in from.') : t('Every change is sent to your server, so the record is the same on each device you sign in from.'); }
  return (
    <section className="section">
      <div className="section-head"><h2>{t('Sync')}</h2></div>
      <div className="set-row">
        <div>
          <div className={`set-status ${s.state === 'down' ? 'warn' : s.store === 'none' ? 'local' : s.state === 'ok' ? 'ok' : ''}`}>{head}</div>
          {body && <p className="set-help">{body}</p>}
        </div>
        {s.mode === 'password' && (
          <div className="set-signed">
            <span className="muted">{t('Signed in')}</span>
            <a className="btn small ghost" href="/?logout">{t('Sign out')}</a>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- language ----------------------------------------------------------------------
// Each language is named in itself, so it can be found from either one.
function Language() {
  const lang = useLang();
  return (
    <section className="section">
      <div className="section-head"><h2>{t('Language')}</h2></div>
      <span className="set-seg" role="radiogroup" aria-label={t('Language')}>
        {LANGUAGES.map((l) => (
          <button key={l.code} role="radio" aria-checked={lang === l.code} lang={l.code} dir={l.dir}
            className={lang === l.code ? 'on' : ''} onClick={() => setLang(l.code)}>{l.name}</button>
        ))}
      </span>
      <p className="set-help">{t('The words of the app. Your questions, notes and what you read stay in the language they were written in. Saved to your record, so it’s the same on each device.')}</p>
    </section>
  );
}

// ---- backup ------------------------------------------------------------------------
function Backup() {
  const fileRef = useRef(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const counts = useRecord(() => ({ threads: R.allThreads().length, sessions: R.allSessions().length, items: R.allItems().length }));

  const doExport = () => {
    const blob = new Blob([JSON.stringify(R.exportRecord(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mosaic-record-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null); setResult(null);
    try {
      let json;
      try { json = JSON.parse(await file.text()); } catch { throw new Error(t('That file isn’t valid JSON.')); }
      const c = R.importRecord(json);
      setResult({ ...c, name: file.name, old: json.version !== 2 });
    } catch (e2) {
      setErr(t('Couldn’t import {name}. {error}', { name: file.name, error: e2.message }));
    }
  };

  const resultVars = result && {
    name: result.name,
    threads: tp(result.threads, '{n} thread', '{n} threads'),
    sessions: tp(result.sessions, '{n} session', '{n} sessions'),
    items: tp(result.items, '{n} item', '{n} items'),
  };

  return (
    <section className="section">
      <div className="section-head"><h2>{t('Backup')}</h2><span className="label">{tp(counts.threads, '{n} thread', '{n} threads')} · {tp(counts.sessions, '{n} session', '{n} sessions')} · {tp(counts.items, '{n} item', '{n} items')}</span></div>
      <p className="set-help">{t('The record is yours. Export writes all of it to one JSON file. Importing merges a file into what’s here: newer copies win, nothing is removed. Exports from the old Mosaic demo can be imported too.')}</p>
      <div className="set-actions">
        <button className="btn" onClick={doExport}>{t('Export record')}</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>{t('Import a record…')}</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} data-testid="import-file" />
      </div>
      {result && (
        <p className="notice set-result">
          {result.old
            ? t('From {name} (an old demo export): {threads}, {sessions} and {items} added or updated.', resultVars)
            : t('From {name}: {threads}, {sessions} and {items} added or updated.', resultVars)}
          {result.threads + result.sessions + result.items === 0 && ` ${t('Everything in it was already here.')}`}
        </p>
      )}
      {err && <p className="error set-result">{err}</p>}
    </section>
  );
}

// ---- ratings -----------------------------------------------------------------------
// ---- people (owner only) ----------------------------------------------------------
function People() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [fresh, setFresh] = useState(null); // the invite just created (show its link)
  const [copied, setCopied] = useState(false);
  const load = async () => {
    try {
      const res = await fetch('/api/users', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || t('Failed ({status})', { status: res.status }));
      setData(j); setError(null);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  const act = async (body) => {
    setError(null);
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || t('Failed ({status})', { status: res.status }));
      if (j.invite) { setFresh(j.invite); setCopied(false); }
      await load();
    } catch (e) { setError(e.message); }
  };
  const linkFor = (code) => `${location.origin}/?invite=${code}`;
  const copy = async (code) => { try { await navigator.clipboard.writeText(linkFor(code)); setCopied(true); } catch { setCopied(false); } };
  const remove = (u) => {
    if (!confirm(t('Remove {name}? Their account, every thread they hold, and anything they shared are deleted. This cannot be undone.', { name: u.name }))) return;
    act({ action: 'remove', id: u.id });
  };
  const users = data?.users || [];
  const invites = data?.invites || [];
  // max is null when there is no limit.
  const room = !data ? 0 : data.max == null ? Infinity : data.max - users.length - invites.length;
  return (
    <section className="section">
      <div className="section-head"><h2>{t('People')}</h2><span className="label">{data ? (data.max == null ? t('{n} · besides you', { n: users.length }) : t('{n} of {max} · besides you', { n: users.length, max: data.max })) : ''}</span></div>
      <p className="set-help">{t('Everyone has their own private threads. A thread is only visible to the others if its holder turns on “Share with others” on it (read-only).')}</p>
      {error && <p className="error">{error}</p>}
      {users.length > 0 && (
        <ul className="set-people">
          {users.map((u) => (
            <li key={u.id}><span className="serif">{u.name}</span><span className="muted">{t('joined {date}', { date: u.createdAt ? fmt(u.createdAt) : '' })}</span><button className="btn link" onClick={() => remove(u)}>{t('Remove')}</button></li>
          ))}
        </ul>
      )}
      {invites.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 12 }}>{t('Open invites')}</div>
          <ul className="set-people">
            {invites.map((i) => (
              <li key={i.code}>
                <code className="set-code">{linkFor(i.code)}</code>
                <span className="muted">{t('expires {date}', { date: fmt(i.expiresAt) })}</span>
                <button className="btn link" onClick={() => copy(i.code)}>{copied && fresh?.code === i.code ? t('Copied') : t('Copy')}</button>
                <button className="btn link" onClick={() => act({ action: 'revoke', code: i.code })}>{t('Revoke')}</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="set-row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!data || room <= 0} onClick={() => act({ action: 'invite' })}>{t('Invite someone')}</button>
        {fresh && <span className="set-help" style={{ margin: 0 }}>{t('Send them the link above. It works once and expires in 7 days.')}</span>}
        {data && room <= 0 && <span className="set-help" style={{ margin: 0 }}>{t('Full — remove someone or revoke an invite to add another.')}</span>}
      </div>
    </section>
  );
}

function Ratings() {
  const on = useRecord(() => R.getSettings().ratings);
  return (
    <section className="section">
      <div className="section-head"><h2>{t('Ratings')}</h2></div>
      <label className="set-toggle">
        <input type="checkbox" checked={!!on} onChange={(e) => R.setSettings({ ratings: e.target.checked })} />
        <span>{t('Rate items, and let ratings shape the feed')}</span>
      </label>
      <p className="set-help">{t("Rate an item 0–4 on five axes (informative, artistic, profound, ethical, entertaining), plus a mindless ↔ thought-provoking scale. Optional and private. When on, every new feed is told which items you rated high and low (across all threads) and leans toward the qualities you rate high — within each slot's job, never instead of it.")}</p>
    </section>
  );
}

// ---- pledge ------------------------------------------------------------------------
function Pledge() {
  const raw = useRecord(() => R.getPledge());
  const ratingsOn = useRecord(() => R.getSettings().ratings);
  const pledge = normalizePledge(raw);
  const [editing, setEditing] = useState(false);
  const now = Date.now();
  const ended = pledge?.endsAt && pledge.endsAt < now;

  return (
    <section className="section">
      <div className="section-head"><h2>{t('Pledge')}</h2><span className="label">{t('private · time-boxed')}</span></div>
      <p className="set-help">{t('A minimum you set for yourself on the rating axes, for a fixed stretch of time. It binds only you. Nothing is published or shared.')}</p>
      {!ratingsOn && <p className="set-help muted">{t('Ratings are off, so items can’t be checked against a bar.')}</p>}
      {editing ? (
        <PledgeEditor pledge={ended ? null : pledge} onDone={() => setEditing(false)} />
      ) : pledge ? (
        <div className="card set-pledge">
          <div className="set-pledge-bar">
            {Object.keys(pledge.bar).length
              ? RATING_AXES.filter((a) => pledge.bar[a.key] != null).map((a) => (
                <span key={a.key} className="chip">{a.label} ≥ {pledge.bar[a.key]}</span>))
              : <span className="muted">{t('No minimums set.')}</span>}
          </div>
          <div className="set-pledge-time">
            {pledge.endsAt ? (ended
              ? t('Ended {date}, after {n} days.', { date: fmt(pledge.endsAt), n: Math.round((pledge.endsAt - pledge.startedAt) / DAY) })
              : t('Started {start} · ends {end} · {left}', {
                start: fmt(pledge.startedAt),
                end: fmt(pledge.endsAt),
                left: <strong>{tp(Math.round((pledge.endsAt - pledge.startedAt) / DAY), '{left} of {n} day left', '{left} of {n} days left', { left: Math.ceil((pledge.endsAt - now) / DAY) })}</strong>,
              }))
              : t('Started {date} · no end date.', { date: fmt(pledge.startedAt) })}
          </div>
          <div className="set-actions">
            <button className="btn small" onClick={() => setEditing(true)}>{ended ? t('Set a new bar') : t('Edit')}</button>
            <button className="btn small ghost" onClick={() => { if (confirm(ended ? t('Clear this ended pledge?') : t('End this pledge now?'))) R.setPledge(null); }}>{ended ? t('Clear') : t('End now')}</button>
          </div>
        </div>
      ) : (
        <button className="btn" onClick={() => setEditing(true)}>{t('Set a bar…')}</button>
      )}
    </section>
  );
}

function PledgeEditor({ pledge, onDone }) {
  const monthsOf = (p) => {
    if (!p?.endsAt) return 3;
    const m = Math.round((p.endsAt - p.startedAt) / (30.44 * DAY));
    return DURATIONS.includes(m) ? m : 3;
  };
  const [bar, setBar] = useState(pledge?.bar || {});
  const [months, setMonths] = useState(() => monthsOf(pledge));
  const set = (k, v) => setBar((b) => { const n = { ...b }; if (v == null) delete n[k]; else n[k] = v; return n; });
  const save = () => {
    const startedAt = pledge?.startedAt || Date.now();
    R.setPledge({ bar, startedAt, endsAt: addMonths(startedAt, months), months });
    onDone();
  };
  const start = pledge?.startedAt || Date.now();
  return (
    <div className="card set-pledge-edit">
      <div className="set-axes">
        {RATING_AXES.map((a) => (
          <div className="set-axis" key={a.key}>
            <span className="set-axis-name">{a.label}</span>
            <span className="set-seg" role="radiogroup" aria-label={t('{axis} minimum', { axis: a.label })}>
              {[null, 1, 2, 3, 4].map((v) => (
                <button key={String(v)} role="radio" aria-checked={(bar[a.key] ?? null) === v}
                  className={(bar[a.key] ?? null) === v ? 'on' : ''} onClick={() => set(a.key, v)}>
                  {v == null ? t('none') : `≥ ${v}`}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="set-dur">
        <span className="label">{t('For')}</span>
        <span className="set-seg">
          {DURATIONS.map((m) => (
            <button key={m} className={months === m ? 'on' : ''} aria-pressed={months === m} onClick={() => setMonths(m)}>
              {tp(m, '{n} month', '{n} months')}
            </button>
          ))}
        </span>
        <span className="muted set-dur-end">{pledge ? t('from {start}, until {end}', { start: fmt(start), end: fmt(addMonths(start, months)) }) : t('until {end}', { end: fmt(addMonths(start, months)) })}</span>
      </div>
      <div className="set-actions">
        <button className="btn primary" onClick={save} disabled={!Object.keys(bar).length}>{pledge ? t('Save') : t('Start the pledge')}</button>
        <button className="btn ghost" onClick={onDone}>{t('Cancel')}</button>
      </div>
    </div>
  );
}

// ---- delete ------------------------------------------------------------------------
function Danger() {
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const run = () => {
    if (typed !== 'DELETE') return;
    R.deleteEverything();
    setTyped(''); setDone(true);
  };
  return (
    <section className="section set-danger">
      <div className="section-head"><h2>{t('Delete everything')}</h2></div>
      <p className="set-help">{t('Removes every thread, session, item, note, rating and your pledge, here and on the server, so it’s gone on every device. It can’t be undone. Export first if you might want it back.')}</p>
      <div className="set-actions">
        <input className="field set-confirm" value={typed} onChange={(e) => { setTyped(e.target.value); setDone(false); }}
          placeholder={t('Type DELETE')} aria-label={t('Type DELETE to confirm')} autoComplete="off" spellCheck={false} />
        <button className="btn set-delete" disabled={typed !== 'DELETE'} onClick={run}>{t('Delete everything')}</button>
      </div>
      {done && <p className="notice set-result">{t('Everything was deleted. The server copy is removed as the deletes sync.')}</p>}
    </section>
  );
}
