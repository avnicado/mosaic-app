// Small shared UI pieces.
import React from 'react';
import { SLOT_BLURB } from '../engine/prompts.js';
import { Icon } from './icons.jsx';

export function SlotTag({ slot, blurb = false }) {
  return (
    <span className={`slot-tag slot-${slot}`}>
      <Icon name={slot} size={13} className="slot-ic" />{slot}{blurb && SLOT_BLURB[slot] ? <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--sans)', fontStyle: 'italic', marginLeft: 8 }}>{SLOT_BLURB[slot]}</span> : null}
    </span>
  );
}

export const Spinner = () => <span className="spinner" aria-label="working" />;

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const d = Math.max(0, now - ts);
  const m = Math.round(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(ts).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Media Nudge's five quality axes (0–4), with entertaining's mindless↔thought-provoking scale.
export const RATING_AXES = [
  { key: 'informative', label: 'Informative' },
  { key: 'artistic', label: 'Artistic' },
  { key: 'profound', label: 'Profound' },
  { key: 'ethical', label: 'Ethical' },
  { key: 'entertaining', label: 'Entertaining' },
  { key: 'provoking', label: 'Mindless ↔ thought-provoking' },
];
