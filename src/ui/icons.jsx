// Mosaic's own icons. One style throughout: a 24-unit grid, a 1.6 monoline
// stroke with round ends, and one small solid "tessera" in each icon — the
// piece of it that carries the meaning (the play button, the keystone, the
// mic head). The solid piece takes --icon-accent, so a media chip can tint it.
import React from 'react';
import { mediaInfo } from '../media.js';
import { openReader } from './reader/store.js';

const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

// name → [stroke path, solid path]
export const ICONS = {
  // ---- media -------------------------------------------------------------
  article:   ['M4 5h13v13.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5zM17 9h3v9.5a1.5 1.5 0 0 1-3 0M7 13h7M7 16h5', 'M7 7.5h7v3H7z'],
  essay:     ['M6 3h8.5L19 7.5V21H6zM14.5 3v4.5H19M9 11.5h7M9 14.5h7M9 17.5h4', 'M14.5 3L19 7.5h-4.5z'],
  paper:     ['M6 3h8.5L19 7.5V21H6zM14.5 3v4.5H19M9 10h4', 'M9 18h1.8v-4H9zM11.6 18h1.8v-6h-1.8zM14.2 18H16v-2.5h-1.8z'],
  book:      ['M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2zM5 20a2 2 0 0 0 2 2h12v-4', 'M13 3h4v7.5l-2-1.6-2 1.6z'],
  reference: ['M3.5 8h17v11.5h-17zM3.5 8V6h6l1.2 2M7 12h10M7 15.5h7', 'M13 5.2h7.5V8H11.8z'],
  video:     ['M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z', 'M10 9v6l5-3z'],
  lecture:   ['M3 4h12.5v9H3zM6 13l-1.5 7M12.5 13l1.5 7M6.5 7.5h6M6.5 10h3.5M19.5 11.5V20', c(19.5, 7.5, 2) + 'M16.5 13.5l3-1.5 3 1.5-.2 1H16.7z'],
  film:      ['M4 4h16v16H4zM7.5 4v16M16.5 4v16M4 8h3.5M4 12h3.5M4 16h3.5M16.5 8H20M16.5 12H20M16.5 16H20', 'M10 9.5h4v5h-4z'],
  podcast:   ['M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6', 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z'],
  interview: ['M3 4.5h11v8H8.5L5 15.5v-3H3zM17 9h4v8.5h-2v2.5l-3-2.5h-5.5v-2.5', 'M6 7.5h5v2H6z'],
  music:     ['M9 17.5V5.5l11-2.5v12.5', c(6.5, 17.5, 2.5) + c(17.5, 15.5, 2.5)],
  art:       ['M3 5h18v14H3zM3 16.5l5-5.5 4.5 4.5 3-3L21 17', c(16, 9, 1.8)],
  forum:     ['M4 4h16v10.5h-8.5L7 18.5v-4H4z', c(8.3, 9.3, 1.1) + c(12, 9.3, 1.1) + c(15.7, 9.3, 1.1)],
  web:       [c(12, 12, 8.5) + 'M3.5 12h17M12 3.5c-2.8 3-2.8 14 0 17M12 3.5c2.8 3 2.8 14 0 17', ''],

  // ---- the four slots --------------------------------------------------------
  sharpen:    ['M3 5l14 7-14 7', c(19.5, 12, 2)],
  complicate: ['M3 8c6 0 6 8 12 8h6M3 16c6 0 6-8 12-8h6', c(9, 12, 2)],
  bridge:     ['M2 8.5h20M4 8.5V20M20 8.5V20M4 20c0-5 3.6-7.5 8-7.5s8 2.5 8 7.5M8 8.5v4.6M16 8.5v4.6', 'M10.7 10.6h2.6l-.4 2.4h-1.8z'],
  ground:     ['M3 20h18M5.5 16h13M8 12h8', 'M10.2 5.5h3.6v3.6h-3.6z'],

  // ---- how an item landed ------------------------------------------------------
  moved:   ['', 'M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2L2.5 12l7.2-2.3z'],
  neutral: [c(12, 12, 6.5), ''],
  closed:  ['M5 12h14M5 8.5v7M19 8.5v7', ''],

  // ---- actions ----------------------------------------------------------------
  keep:    ['M7 3.5h10v17l-5-4-5 4z', ''],
  kept:    ['', 'M7 3.5h10v17l-5-4-5 4z'],
  note:    ['M4 20l1-4.2L15.8 5l3.2 3.2L8.2 19zM13.8 7l3.2 3.2', 'M4 20l1-4.2 3.2 3.2z'],
  rate:    ['M4 7h16M4 12h16M4 17h16', c(9, 7, 2) + c(15.5, 12, 2) + c(7, 17, 2)],
  swap:    ['M4.5 10a8 8 0 0 1 13.8-3.6L20 8M20 3.5V8h-4.5M19.5 14a8 8 0 0 1-13.8 3.6L4 16M4 20.5V16h4.5', ''],
  pursue:  ['M6 21V4M6 13c0-3.5 3-6 7-6h5M15.5 4l3 3-3 3', c(6, 13, 2)],
  open:    ['M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', ''],
  plus:    ['M12 5v14M5 12h14', ''],
  x:       ['M6 6l12 12M18 6L6 18', ''],
  arrow:   ['M4 12h15M14 7l5 5-5 5', ''],
  back:    ['M20 12H5M10 7l-5 5 5 5', ''],
  expand:  ['M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5', ''],
  menu:    ['M4 7h16M4 12h16M4 17h16', ''],
  hold:    ['M6 12.5V7.5a1.5 1.5 0 0 1 3 0V11M9 10V5.5a1.5 1.5 0 0 1 3 0V11M12 10V6.5a1.5 1.5 0 0 1 3 0V11M15 11V8.5a1.5 1.5 0 0 1 3 0v6a6.5 6.5 0 0 1-6.5 6.5h-.8a6.5 6.5 0 0 1-4.9-2.2L3 15.5l1-1a1.8 1.8 0 0 1 2.3-.1L8 15.8', ''],
  reread:  ['M3 12a9 9 0 0 1 15.5-6.2M21 12a9 9 0 0 1-15.5 6.2M18.5 2.5v3.3h-3.3M5.5 21.5v-3.3h3.3', c(12, 12, 2.5)],

  // ---- places -------------------------------------------------------------------
  desk:      ['M3 12h18M5 12v8M19 12v8M13 12v4.5h6M6.5 12V9.5h7.5V12', 'M7.5 9.5V7h5.5v2.5z'],
  promenade: ['M3 20h18M3 8h18M4.5 8l7.5-4.5L19.5 8M5 20v-6.5a2.5 2.5 0 0 1 5 0V20M14 20v-6.5a2.5 2.5 0 0 1 5 0V20', 'M11 11h2v9h-2z'],
  library:   ['M3 20.5h18M4.5 20.5V5h3.5v15.5M10 20.5V3.5h3.5v17', 'M15.2 20.2l2.6-15 3.3.6-2.6 15z'],
  settings:  [c(12, 12, 7) + 'M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7', c(12, 12, 2.6)],
  shared:    [c(9, 12, 5.5) + c(15, 12, 5.5), 'M12 7.6a5.5 5.5 0 0 1 0 8.8 5.5 5.5 0 0 1 0-8.8z'],
  quest:     [c(12, 12, 8.5) + 'M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22', 'M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8z'],
  thread:    ['M4 19c3-9 6 3 9-6s4-6 7-8', c(4, 19, 1.6) + c(20, 5, 1.6)],
  feedback:  ['M4 4.5h16v11H12.5L8 19.5v-4H4z', 'M8 8.5h8v1.8H8z'],
  signout:   ['M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9', ''],
  mosaic:    ['', 'M3 4h7.5l-1 7H3zM12 3.5l8.5 1.5-1.5 6.5-8-1zM3 12.5h6.5l1.5 8H3zM11.5 11.8l8 1.2L21 20.5h-8.5z'],
};

export function Icon({ name, size = 16, className = '', title, style, strokeWidth = 1.6 }) {
  const def = ICONS[name];
  if (!def) return null;
  const [stroke, solid] = def;
  return (
    <svg className={`ic ic-${name} ${className}`} width={size} height={size} viewBox="0 0 24 24" style={style}
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {stroke && <path d={stroke} />}
      {solid && <path d={solid} fill="var(--icon-accent, currentColor)" stroke="none" />}
    </svg>
  );
}

// The icon as raw SVG markup, for canvases built as strings (the mosaic).
export function iconMarkup(name, { x = 0, y = 0, size = 24, color = 'currentColor', accent = color, opacity = 1, width = 1.6 } = {}) {
  const def = ICONS[name];
  if (!def) return '';
  const k = size / 24;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})" opacity="${opacity}" pointer-events="none">` +
    (def[0] ? `<path d="${def[0]}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
    (def[1] ? `<path d="${def[1]}" fill="${accent}"/>` : '') +
    `</g>`;
}

// A small cut tile with the media icon on it, tinted by what you do with it
// (read / watch / listen / look / talk).
export function MediaChip({ type, url, label = false, size = 15 }) {
  const m = mediaInfo(type, url);
  return (
    <span className={`mchip fam-${m.family} ${label ? 'with-label' : ''}`} title={m.label}>
      <span className="mchip-tile"><Icon name={m.type} size={size} /></span>
      {label && <span className="mchip-label">{m.label}</span>}
    </span>
  );
}

// A record item (has a session or a quest) opens with its ✦ / keep controls in the reader.
const readerTarget = (item) => (item.id && (item.sessionId || item.questId)
  ? { itemId: item.id }
  : { url: item.url, title: item.title, source: item.source, mediaType: item.mediaType, why: item.why, preview: item.preview || item.excerpt });

// Open an item in the Mosaic reader. For links: a plain click opens the
// reader; cmd/ctrl/shift/middle-click keeps the browser's "open in new tab".
export function readerClick(item, after) {
  return (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
    e.preventDefault();
    openReader(readerTarget(item));
    after?.();
  };
}

// The clear way into an item: "Watch", "Read", "Listen" opens it inside
// Mosaic; the small arrow beside it goes to the original site.
export function OpenButton({ item, onOpen, compact = false }) {
  const m = mediaInfo(item.mediaType, item.url);
  let host = '';
  try { host = new URL(item.url).hostname.replace(/^www\./, ''); } catch { /* no url */ }
  if (!item.url) return null;
  return (
    <span className={`open-pair fam-${m.family} ${compact ? 'compact' : ''}`}>
      <a className={`open-btn fam-${m.family} ${compact ? 'compact' : ''}`} href={item.url} target="_blank" rel="noopener noreferrer"
        onClick={readerClick(item, onOpen)} title={`${m.verb} in Mosaic: ${item.title || item.url}`}>
        <Icon name={m.type} size={compact ? 14 : 16} />
        <span className="open-verb">{m.verb}</span>
        {!compact && <span className="open-host">in Mosaic</span>}
      </a>
      <a className="open-site" href={item.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}
        title={`Open on ${host || 'the site'}`} aria-label={`Open on ${host || 'the site'}`}>
        <Icon name="open" size={compact ? 12 : 14} />{!compact && host && <span>{host}</span>}
      </a>
    </span>
  );
}
