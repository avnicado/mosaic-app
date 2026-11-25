import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { boot, onSyncStatus, wipeLocal } from './sync.js';
import { setSessionInfo } from './session.js';
import { t, applyDocument, reloadLang } from './i18n/index.js';
import './i18n/rtl.css';

applyDocument(); // sign-in screens follow the last language used on this device

const App = React.lazy(() => import('./ui/App.jsx'));

const shell = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#f5f0e6', color: '#1a1612', fontFamily: "'Instrument Sans', -apple-system, sans-serif", padding: 16,
};
const field = { width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '10px 12px', fontSize: 16, border: '1px solid #d4c9b4', borderRadius: 3, background: '#fffdf8', marginTop: 10 };
const primary = { marginTop: 14, width: '100%', minHeight: 46, padding: '10px 12px', fontSize: 16, border: '1px solid #8f2418', background: '#8f2418', color: '#f5f0e6', borderRadius: 3, cursor: 'pointer' };
const title = { fontFamily: 'Fraunces, serif', fontWeight: 400, fontSize: 32, margin: '0 0 6px' };
const sub = { color: '#8a7f72', fontSize: 14.5, margin: '0 0 8px', lineHeight: 1.5 };
const err = { color: '#8f2418', fontSize: 14 };
const link = { color: '#8f2418' };

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || t('Failed ({status})', { status: res.status }));
  return j;
}

function Login({ onDone, mode, signup, onSignup }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await post('/api/login', { name, password: pw }); onDone(); } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div style={shell}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340 }}>
        <h1 style={title}>{t('Mosaic')}</h1>
        {mode === 'locked' ? (
          <p style={err}>{t("This deployment has no {var} set. Add it in the project's environment variables and redeploy.", { var: <code>APP_PASSWORD</code> })}</p>
        ) : (
          <>
            <input style={field} autoFocus autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Name (leave empty if you're the owner)")} />
            <input style={field} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t('Password')} />
            <button type="submit" disabled={busy || (!pw && mode !== 'open')} style={primary}>{busy ? t('Signing in…') : t('Sign in')}</button>
            {error && <p style={err}>{error}</p>}
            {signup && <p style={{ ...sub, marginTop: 18, textAlign: 'center' }}>{t('New here? {link}', { link: <a href="#" onClick={(e) => { e.preventDefault(); onSignup(); }} style={link}>{t('Create an account')}</a> })}</p>}
          </>
        )}
      </form>
    </div>
  );
}

// code: a one-time invite. Without one this is open sign-up.
function Join({ code, valid, onDone, onBack }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setError(t("The passwords don't match.")); return; }
    setBusy(true); setError(null);
    try {
      await post('/api/join', code ? { code, name, password: pw } : { name, password: pw });
      if (code) history.replaceState(null, '', location.pathname + location.hash);
      onDone();
    } catch (e2) { setError(e2.message); } finally { setBusy(false); }
  };
  return (
    <div style={shell}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={title}>{code ? t('Join Mosaic') : t('Create an account')}</h1>
        {!valid ? (
          <p style={err}>{t('This invite link is no longer valid. Ask for a new one.')}</p>
        ) : (
          <>
            <p style={sub}>{code ? t("You've been invited. Your threads will be private to you; you can choose to share a thread with the others later.") : t('Your threads will be private to you; you can choose to share a thread with the others later.')}</p>
            <input style={field} autoFocus autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} />
            <input style={field} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={t('Choose a password (8+ characters)')} />
            <input style={field} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder={t('Password again')} />
            <button type="submit" disabled={busy || !name.trim() || pw.length < 8} style={primary}>{busy ? t('Joining…') : t('Join')}</button>
            {error && <p style={err}>{error}</p>}
          </>
        )}
        {onBack && <p style={{ ...sub, marginTop: 18, textAlign: 'center' }}>{t('Have an account? {link}', { link: <a href="#" onClick={(e) => { e.preventDefault(); onBack(); }} style={link}>{t('Sign in')}</a> })}</p>}
      </form>
    </div>
  );
}

const BADGE = {
  pending: null,
  get offline() { return t('Not saved to the server yet — retrying'); },
  get 'signed-out'() { return t('Signed out — reload to sign in; changes are kept on this device'); },
  saved: null,
};

function SyncBadge() {
  const [s, setS] = useState(null);
  useEffect(() => { onSyncStatus(setS); }, []);
  const text = s && BADGE[s];
  if (!text) return null;
  return (
    <div className="sync-badge" style={{ position: 'fixed', bottom: 'calc(12px + env(safe-area-inset-bottom))', insetInlineStart: 12, zIndex: 9999, background: '#fbf3e2', border: '1px solid #b8923a', color: '#4a4038', fontSize: 12.5, padding: '6px 10px', borderRadius: 2 }}>
      {text}
    </div>
  );
}

function Root() {
  const [state, setState] = useState({ phase: 'checking' });
  const invite = new URLSearchParams(location.search).get('invite');

  const start = async () => {
    setState({ phase: 'checking' });
    let session = { authed: true, mode: 'open', user: { id: 'owner', name: 'owner', role: 'owner' } };
    try {
      const res = await fetch('/api/session' + (invite ? `?invite=${encodeURIComponent(invite)}` : ''), { cache: 'no-store' });
      if (res.ok) session = await res.json();
    } catch { /* offline: run on local data */ }
    setSessionInfo(session);
    if (invite && session.user?.role !== 'member') { setState({ phase: 'join', valid: session.inviteValid !== false }); return; }
    if (!session.authed) { setState({ phase: 'login', mode: session.mode, signup: !!session.signup && session.mode === 'password' }); return; }
    const r = await boot(session.user?.id || 'owner');
    reloadLang(); // the person's own choice, now that their record is here
    if (!r.ok) { setState({ phase: 'login', mode: session.mode, signup: !!session.signup && session.mode === 'password' }); return; }
    setState({ phase: 'app' });
  };

  useEffect(() => {
    if (new URLSearchParams(location.search).has('logout')) {
      wipeLocal(); // don't leave this person's record in the browser
      fetch('/api/logout', { method: 'POST' }).finally(() => { location.replace(location.pathname); });
      return;
    }
    start();
  }, []);

  if (state.phase === 'join') return <Join code={invite} valid={state.valid} onDone={start} />;
  if (state.phase === 'signup') return <Join valid onDone={start} onBack={() => setState({ ...state, phase: 'login' })} />;
  if (state.phase === 'login') return <Login mode={state.mode} signup={state.signup} onSignup={() => setState({ ...state, phase: 'signup' })} onDone={start} />;
  if (state.phase !== 'app') return <div style={shell} />;
  return (
    <>
      <React.Suspense fallback={<div style={shell} />}>
        <App />
      </React.Suspense>
      <SyncBadge />
    </>
  );
}

createRoot(document.getElementById('root')).render(<Root />);

// public/sw.js: an offline fallback page and a cache of the shell. The Android
// app (a Trusted Web Activity) needs it — Play treats a Chrome network error
// on a dead connection as a defect. Production only: in dev the worker would
// serve a stale shell over Vite's.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
