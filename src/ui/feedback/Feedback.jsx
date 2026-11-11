// Alpha feedback. Everyone gets a "Send feedback" button; the note goes to the
// owner (the admin), who reads it in Settings. A note carries only what the
// person typed, the name of the page they were on, and a rough device label:
// never their threads or anything from their record.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icons.jsx';
import { isOwner } from '../../session.js';
import './feedback.css';

export const KINDS = [
  { key: 'bug', label: 'Something broke' },
  { key: 'confusing', label: 'Confusing' },
  { key: 'idea', label: 'An idea' },
  { key: 'other', label: 'Other' },
];
const MAX = 4000;

async function post(body) {
  const res = await fetch('/api/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Could not send (${res.status}).`);
  return j;
}

const deviceLabel = () => {
  const width = window.matchMedia?.('(max-width: 760px)').matches ? 'phone width' : 'wide screen';
  return `${width} · ${(navigator.userAgent || '').slice(0, 110)}`;
};

// ---- the owner's unread count (sidebar badge, Settings inbox) -------------------------
let unread = 0;
const subs = new Set();
const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function setUnread(n) { unread = n; for (const fn of subs) fn(); }

export async function refreshUnread() {
  if (!isOwner()) return;
  try {
    const res = await fetch('/api/feedback?count=1', { cache: 'no-store' });
    if (res.ok) setUnread((await res.json()).unread || 0);
  } catch { /* offline: keep the last count */ }
}

export function useUnreadFeedback() {
  const n = useSyncExternalStore(subscribe, () => unread);
  useEffect(() => {
    if (!isOwner()) return undefined;
    refreshUnread();
    const id = setInterval(refreshUnread, 5 * 60 * 1000);
    window.addEventListener('focus', refreshUnread);
    return () => { clearInterval(id); window.removeEventListener('focus', refreshUnread); };
  }, []);
  return n;
}

// ---- the button and its dialog ------------------------------------------------------------
export function FeedbackButton({ page }) {
  const dlg = useRef(null);
  const [kind, setKind] = useState('other');
  const [message, setMessage] = useState('');
  const [context, setContext] = useState(true);
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState(null);

  const open = () => { setState((s) => (s === 'sent' ? 'idle' : s)); setError(null); dlg.current?.showModal(); };
  const close = () => dlg.current?.close();

  const send = async (e) => {
    e.preventDefault();
    if (!message.trim() || state === 'sending') return;
    setState('sending'); setError(null);
    try {
      await post({ message, kind, ...(context ? { page, device: deviceLabel() } : {}) });
      setMessage(''); setKind('other'); setState('sent');
    } catch (err) {
      setError(err.message); setState('idle'); // the text stays, so nothing is lost
    }
  };

  return (
    <>
      <button type="button" className="side-link fb-open" onClick={open}><Icon name="feedback" size={17} />Send feedback</button>
      <dialog ref={dlg} className="fb" aria-labelledby="fb-title"
        onClick={(e) => { if (e.target === dlg.current) close(); }}>
        {state === 'sent' ? (
          <div className="fb-body">
            <h2 id="fb-title">Sent. Thank you.</h2>
            <p className="fb-help">The admin will read it. Your note went to no one else.</p>
            <div className="fb-actions">
              <button type="button" className="btn primary" onClick={close}>Close</button>
              <button type="button" className="btn ghost" onClick={() => setState('idle')}>Write another</button>
            </div>
          </div>
        ) : (
          <form className="fb-body" onSubmit={send}>
            <div className="fb-head">
              <h2 id="fb-title">Tell the admin</h2>
              <button type="button" className="fb-x" onClick={close} aria-label="Close"><Icon name="x" size={14} /></button>
            </div>
            <p className="fb-help">Mosaic is in alpha. Say what broke, what confused you, or what you wish it did. Your note goes straight to the admin and to no one else.</p>
            <div className="fb-kinds" role="radiogroup" aria-label="What kind of note is this?">
              {KINDS.map((k) => (
                <button key={k.key} type="button" role="radio" aria-checked={kind === k.key}
                  className={kind === k.key ? 'on' : ''} onClick={() => setKind(k.key)}>{k.label}</button>
              ))}
            </div>
            <label className="label" htmlFor="fb-text">Your note</label>
            <textarea id="fb-text" className="field" rows={6} maxLength={MAX} value={message} autoFocus
              onChange={(e) => setMessage(e.target.value)} placeholder="What happened, and what did you expect?" />
            <label className="fb-check">
              <input type="checkbox" checked={context} onChange={(e) => setContext(e.target.checked)} />
              <span>Include which page I am on and my device type. Never my threads or anything I wrote.</span>
            </label>
            {error && <p className="error">{error}</p>}
            <div className="fb-actions">
              <button type="submit" className="btn primary" disabled={!message.trim() || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send'}</button>
              <button type="button" className="btn ghost" onClick={close}>Cancel</button>
              <span className="fb-count muted">{message.length}/{MAX}</span>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

// ---- the owner's inbox (Settings) ------------------------------------------------------------
const when = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function FeedbackInbox() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const load = async () => {
    try {
      const res = await fetch('/api/feedback', { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message || `Failed (${res.status})`);
      setItems(j.items); setUnread(j.unread); setError(null);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  const act = async (action, id) => {
    try { await post({ action, id }); await load(); } catch (e) { setError(e.message); }
  };
  const n = (items || []).filter((f) => !f.read).length;
  return (
    <section className="section">
      <div className="section-head"><h2>Feedback</h2><span className="label">{items ? `${n} unread · ${items.length} in all` : ''}</span></div>
      <p className="set-help">Notes people send with “Send feedback”. Only you can read them.</p>
      {error && <p className="error">{error}</p>}
      {items && !items.length && <p className="muted">Nothing yet.</p>}
      <ul className="fb-list">
        {(items || []).map((f) => (
          <li key={f.id} className={f.read ? 'read' : ''}>
            <div className="fb-meta">
              <span className="fb-kind">{KINDS.find((k) => k.key === f.kind)?.label || 'Other'}</span>
              <span className="serif">{f.userName}</span>
              <span className="muted">{when(f.createdAt)}{f.page ? ` · on ${f.page}` : ''}</span>
            </div>
            <p className="fb-msg">{f.message}</p>
            {f.device && <p className="fb-device muted">{f.device}</p>}
            <div className="fb-row-actions">
              <button className="btn link" onClick={() => act(f.read ? 'unread' : 'read', f.id)}>{f.read ? 'Mark unread' : 'Mark read'}</button>
              <button className="btn link" onClick={() => { if (confirm('Delete this note?')) act('delete', f.id); }}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
