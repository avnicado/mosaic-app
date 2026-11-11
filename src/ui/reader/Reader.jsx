// The Mosaic reader: an item opened inside the app. Video and audio play in
// the site's own embed player; articles are extracted on the server
// (/api/read) and set in Mosaic's type. When neither works, it says why and
// offers the site. The original is always one click away. While it is open,
// useProgress records how much of it you read, watched or listened to.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import DOMPurify from 'dompurify';
import * as R from '../../data/record.js';
import * as A from '../../data/actions.js';
import { useRecord } from '../../data/hooks.js';
import { apiFetch } from '../../engine/llm.js';
import { embedFor } from '../../embed.js';
import { progressText } from '../../data/progress.js';
import { canTrack, connectPlayer, mountSpotify } from './players.js';
import { useProgress } from './useProgress.js';
import { mediaInfo } from '../../media.js';
import { Icon, MediaChip } from '../icons.jsx';
import { SlotTag, Spinner, hostOf } from '../kit.jsx';
import { subscribeReader, getReader, closeReader } from './store.js';
import '../thread/thread.css';
import { REACTIONS } from '../../engine/quest.js';
import { react } from '../../data/quests.js';
import '../quest/quest.css';
import './reader.css';

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('loading', 'lazy');
    node.setAttribute('referrerpolicy', 'no-referrer');
  }
});
const clean = (html) => DOMPurify.sanitize(html, {
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math', 'video', 'audio'],
  FORBID_ATTR: ['style', 'class', 'id', 'width', 'height', 'srcset', 'sizes'],
  ALLOW_DATA_ATTR: false,
});

const SIGNALS = [
  { key: 'moved', label: 'moved me' },
  { key: 'neutral', label: 'neutral' },
  { key: 'closed', label: 'closed it down' },
];

const WHY_NOT = {
  gone: 'The page is gone from the site (it answered “not found”).',
  blocked: 'The site wouldn’t hand the page to Mosaic (many sites block servers).',
  empty: 'There’s no article on this page to pull out: it may be an app, a paywall or mostly pictures.',
  pdf: 'This is a PDF.',
  bad_url: 'This link can’t be read inside Mosaic.',
  error: 'Mosaic couldn’t load the page.',
};

export default function Reader() {
  const target = useSyncExternalStore(subscribeReader, getReader);
  if (!target) return null;
  return <ReaderPanel key={target.itemId || target.url} target={target} />;
}

function ReaderPanel({ target }) {
  const stored = useRecord(() => (target.itemId ? R.getItem(target.itemId) : null), [target.itemId]);
  const item = stored || target;
  const embed = useMemo(() => embedFor(item.url), [item.url]);
  const m = mediaInfo(item.mediaType, item.url);
  const [article, setArticle] = useState(embed ? null : { loading: true });
  const [spotifyFailed, setSpotifyFailed] = useState(false);
  const panel = useRef(null);
  const scrollRef = useRef(null);
  const articleRef = useRef(null);
  const frameRef = useRef(null);
  const spotifyRef = useRef(null);
  const spotify = embed?.provider === 'spotify' && !spotifyFailed;

  const onPlayer = useProgress({
    itemId: target.itemId,
    kind: !embed ? 'read' : embed.kind === 'audio' ? 'listen' : 'watch',
    mode: !embed ? 'read' : canTrack(embed) && !spotifyFailed ? 'player' : 'estimate',
    provider: embed?.provider || null,
    article: article?.html ? { minutes: article.minutes, expectSec: article.expectSec, density: article.density } : null,
    ready: !!article?.html,
    scrollRef, articleRef, frameRef,
  });
  useEffect(() => {
    if (!embed || spotify || !frameRef.current) return undefined;
    return connectPlayer(frameRef.current, embed, onPlayer);
  }, [embed, spotify]);
  useEffect(() => {
    if (!spotify || !spotifyRef.current) return undefined;
    let cleanup = null, alive = true;
    mountSpotify(spotifyRef.current, embed, onPlayer)
      .then((c) => { if (alive) cleanup = c; else c(); })
      .catch(() => { if (alive) setSpotifyFailed(true); });
    return () => { alive = false; cleanup?.(); };
  }, [spotify]);

  useEffect(() => { if (target.itemId) A.markOpened(target.itemId); }, [target.itemId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeReader(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    if (embed || !item.url) return undefined;
    let alive = true;
    apiFetch('/api/read?url=' + encodeURIComponent(item.url))
      .then((r) => r.json())
      .then((d) => { if (alive) setArticle(d.ok ? { ...d, html: clean(d.html) } : { failed: d.reason || 'error', message: d.message }); })
      .catch((e) => { if (alive) setArticle({ failed: 'error', message: e.message }); });
    return () => { alive = false; };
  }, [item.url]);

  const host = hostOf(item.url);
  const meta = [
    article?.byline && article.byline !== item.source ? article.byline : null,
    item.source || article?.siteName,
    host,
    article?.minutes ? `${article.minutes} min read${article.density ? ` · ${article.density}` : ''}` : null,
  ].filter(Boolean);

  return (
    <div className="rd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeReader(); }}>
      <div className="rd" role="dialog" aria-modal="true" aria-label={item.title} tabIndex={-1} ref={panel}>
        <header className="rd-bar">
          <MediaChip type={item.mediaType} url={item.url} label />
          {item.slot && <SlotTag slot={item.slot} />}
          <span className="rd-spacer" />
          <a className="rd-site" href={item.url} target="_blank" rel="noopener noreferrer" title="Open the original in a new tab">
            Open on {host || 'the site'} <Icon name="open" size={13} />
          </a>
          <button className="rd-close" onClick={closeReader} title="Close (Esc)" aria-label="Close"><Icon name="x" size={18} /></button>
        </header>

        <div className="rd-scroll" ref={scrollRef}>
          <div className={`rd-body ${embed ? 'rd-media' : ''}`}>
            <h1 className="rd-title">{article?.title && !embed ? article.title : item.title}</h1>
            <div className="rd-meta">{meta.join(' · ')}</div>
            {item.why && <p className="rd-why"><span className="label">Why here</span> {item.why}</p>}

            {spotify && <div className="rd-embed audio" ref={spotifyRef} style={{ height: embed.height }} />}
            {embed && !spotify && (
              <div className={`rd-embed ${embed.kind}`} style={embed.height ? { height: embed.height } : undefined}>
                <iframe ref={frameRef} src={embed.src} title={item.title} loading="lazy" allowFullScreen
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
                  referrerPolicy="strict-origin-when-cross-origin" />
              </div>
            )}
            {embed && item.preview && <p className="rd-preview">{item.preview}</p>}

            {!embed && article?.loading && <div className="rd-loading"><Spinner /> Getting the {m.type === 'paper' ? 'paper' : 'article'} from {host}…</div>}
            {!embed && article?.failed && (
              <div className="rd-failed">
                <p>{WHY_NOT[article.failed] || WHY_NOT.error}</p>
                {item.preview && <p className="rd-preview">{item.preview}</p>}
                <a className="btn primary" href={item.url} target="_blank" rel="noopener noreferrer">
                  {m.verb} on {host} <Icon name="open" size={14} />
                </a>
              </div>
            )}
            {!embed && article?.html && (
              <article className="rd-article" ref={articleRef} dangerouslySetInnerHTML={{ __html: article.html }} />
            )}
            {!embed && article?.html && (
              <p className="rd-end">
                Pulled from <a href={article.url || item.url} target="_blank" rel="noopener noreferrer">{hostOf(article.url || item.url)}</a> for reading here.
                Pictures, charts or parts of the page may be missing; the original is the real thing.
              </p>
            )}
          </div>
        </div>

        {stored && <ReaderFoot item={stored} />}
      </div>
    </div>
  );
}

// ✦ / ○ / – and keep, without leaving the reader, and how much of it you've had.
function ReaderFoot({ item }) {
  const had = progressText(item.progress);
  if (item.questId) return (
    <footer className="rd-foot">
      {had && <span className="rd-had" title="Recorded while it was open in Mosaic">{had}</span>}
      <span className="rd-foot-q">How did it land?</span>
      <div className="qs-reacts rd-signals" role="group" aria-label="How did this land?">
        {REACTIONS.map((r) => (
          <button key={r.key} className={`qs-react r-${r.key} ${item.reaction === r.key ? 'on' : ''}`}
            aria-pressed={item.reaction === r.key} onClick={() => react(item.id, r.key)}>{r.label}</button>
        ))}
      </div>
    </footer>
  );
  return (
    <footer className="rd-foot">
      {had && <span className="rd-had" title="Recorded while it was open in Mosaic">{had}</span>}
      <span className="rd-foot-q">How did it land?</span>
      <div className="th-signals rd-signals" role="group" aria-label="How did this land?">
        {SIGNALS.map((s) => (
          <button key={s.key} className={`th-sig th-sig-${s.key} ${item.signal === s.key ? 'on' : ''}`}
            aria-pressed={item.signal === s.key} onClick={() => A.setSignal(item.id, s.key)}>
            <Icon name={s.key} size={13} className="th-sig-g" /> {s.label}
          </button>
        ))}
      </div>
      <button className={`th-keep ${item.kept ? 'on' : ''}`} onClick={() => A.toggleKeep(item.id)} aria-pressed={!!item.kept}>
        <Icon name={item.kept ? 'kept' : 'keep'} size={15} /><span className="th-keep-l">{item.kept ? 'Kept' : 'Keep'}</span>
      </button>
    </footer>
  );
}
