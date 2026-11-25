// Small shared UI pieces.
import React from 'react';
import { SLOT_BLURB } from '../engine/prompts.js';
import { Icon } from './icons.jsx';
import { t, loc } from '../i18n/index.js';

export function SlotTag({ slot, blurb = false }) {
  return (
    <span className={`slot-tag slot-${slot}`}>
      <Icon name={slot} size={13} className="slot-ic" />{t(slot)}{blurb && SLOT_BLURB[slot] ? <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'var(--sans)', fontStyle: 'italic', marginInlineStart: 8 }}>{t(SLOT_BLURB[slot])}</span> : null}
    </span>
  );
}

export const Spinner = () => <span className="spinner" aria-label={t('working')} />;

export function timeAgo(ts, now = Date.now()) {
  if (!ts) return '';
  const d = Math.max(0, now - ts);
  const m = Math.round(d / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('{n} h ago', { n: h });
  const days = Math.round(h / 24);
  if (days < 14) return t('{n} d ago', { n: days });
  return new Date(ts).toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: new Date(ts).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Media Nudge's five quality axes (0–4), with entertaining's mindless↔thought-provoking scale.
export const RATING_AXES = [
  { key: 'informative', get label() { return t('Informative'); } },
  { key: 'artistic', get label() { return t('Artistic'); } },
  { key: 'profound', get label() { return t('Profound'); } },
  { key: 'ethical', get label() { return t('Ethical'); } },
  { key: 'entertaining', get label() { return t('Entertaining'); } },
  { key: 'provoking', get label() { return t('Mindless ↔ thought-provoking'); } },
];
