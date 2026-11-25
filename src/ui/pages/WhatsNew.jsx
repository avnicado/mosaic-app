import React, { useEffect, useState } from 'react';
import { RELEASES, CURRENT_VERSION, compareVersions } from '../../releases.js';
import { useSeenVersion, markSeen } from '../../data/whatsnew.js';
import './whatsnew.css';
import { t, loc } from '../../i18n/index.js';

const KIND = { get new() { return t('New'); }, get better() { return t('Better'); }, get fixed() { return t('Fixed'); } };
const ORDER = ['new', 'better', 'fixed'];

const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(loc(), { month: 'long', day: 'numeric', year: 'numeric' });

export default function WhatsNew() {
  const seen = useSeenVersion();
  // What was unread when the page opened stays marked while you read it.
  const [seenAtOpen] = useState(seen);
  useEffect(() => { markSeen(); }, []);

  const isNew = (r) => (seenAtOpen ? compareVersions(r.version, seenAtOpen) > 0 : r.version === CURRENT_VERSION);

  return (
    <div className="page wn">
      <div className="eyebrow">{t('What’s new')}</div>
      <h1>{t('What’s new in Mosaic')}</h1>
      <p className="wn-lede">{t('You’re on version {version}. Each version below says what changed, newest first.', { version: <span className="wn-ver">{CURRENT_VERSION}</span> })}</p>

      {RELEASES.map((r) => (
        <section key={r.version} className={`wn-release ${isNew(r) ? 'unseen' : ''}`} aria-labelledby={`wn-${r.version}`}>
          <div className="wn-meta">
            <span className="wn-ver">{r.version}</span>
            <span className="wn-date">{fmtDate(r.date)}</span>
            {isNew(r) && <span className="wn-tag">{t('New to you')}</span>}
          </div>
          <h2 id={`wn-${r.version}`}>{r.title}</h2>
          {r.summary && <p className="wn-summary">{r.summary}</p>}
          {ORDER.map((kind) => {
            const items = r.changes.filter((c) => c.kind === kind);
            if (!items.length) return null;
            return (
              <div key={kind} className="wn-group">
                <div className={`wn-kind ${kind}`}>{KIND[kind]}</div>
                <ul>{items.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
