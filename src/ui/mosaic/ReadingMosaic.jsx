// The Library's mosaic: one stone per item you've read or seen, grouped by
// field, with the topics that recur laid together and the fields that share
// topics seamed together. Below it: how much of your reading overlaps, and
// whether you're spreading out.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as R from '../../data/record.js';
import { tagUntagged, engaged } from '../../data/actions.js';
import { threadPath } from '../router.js';
import { Icon, MediaChip, OpenButton } from '../icons.jsx';
import { progressText } from '../../data/progress.js';
import { MEDIA, FAMILY } from '../../media.js';
import { piecesFrom, fieldsFrom, spreadStats, KINDS, topicSlug, UNSORTED } from './model.js';
import { buildReadingMosaic } from './build.js';
import { tessera } from './geometry.js';
import './mosaic.css';
import { t, tp, loc, useLang } from '../../i18n/index.js';

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const SIGNAL_WORDS = {
  get moved() { return t('✦ moved you'); },
  get neutral() { return t('○ neutral'); },
  get closed() { return t('– closed it down'); },
};
// A field's name as shown (FIELDS and 'unsorted'); stored and matched in English.
const fieldName = (f) => (f === UNSORTED ? t('unsorted') : t(f));

export default function ReadingMosaic({ threads, items }) {
  const pieces = useMemo(() => piecesFrom(items, threads), [items, threads]);
  const model = useMemo(() => fieldsFrom(pieces), [pieces]);
  const stats = useMemo(() => spreadStats(pieces, threads), [pieces, threads]);
  const lang = useLang(); // the floor's captions and tooltips are written into the SVG
  const svg = useMemo(() => buildReadingMosaic(model), [model, lang]);
  const [focus, setFocus] = useState(null); // { kind: 'topic'|'field', value }
  const [selected, setSelected] = useState(null);
  const canvas = useRef(null);
  const tag = useTagging(items);

  // Highlight the pieces that carry the focused topic / field.
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    root.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
    root.classList.toggle('hl', !!focus);
    if (!focus) return;
    const sel = focus.kind === 'topic' ? `[data-t~="${topicSlug(focus.value)}"]` : `[data-f="${CSS.escape(focus.value)}"]`;
    root.querySelectorAll(sel).forEach((el) => el.classList.add('on'));
    if (selected) root.querySelector(`[data-item="${CSS.escape(selected)}"]`)?.classList.add('on');
  }, [focus, svg, selected]);
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    root.querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'));
    if (selected) root.querySelector(`[data-item="${CSS.escape(selected)}"]`)?.classList.add('sel');
  }, [selected, svg]);

  const onClick = (e) => {
    const piece = e.target.closest?.('[data-item]');
    if (piece) { setSelected(piece.getAttribute('data-item')); return; }
    const label = e.target.closest?.('.rm-label');
    if (label) { const f = label.getAttribute('data-f'); setFocus((cur) => (cur?.value === f ? null : { kind: 'field', value: f })); return; }
    const seam = e.target.closest?.('.rm-seam');
    if (seam) { const t = seam.getAttribute('data-t').split(' ')[0]; setFocus({ kind: 'topic', value: t.replace(/_/g, ' ') }); return; }
    setSelected(null); setFocus(null);
  };
  const focusTopic = (t) => setFocus((cur) => (cur?.kind === 'topic' && cur.value === t ? null : { kind: 'topic', value: t }));

  if (!pieces.length) {
    return (
      <div className="rm">
        <p className="rm-empty">
          {t('The mosaic is laid from what you actually read and watch: every item you open, mark, keep or note becomes a stone. Nothing yet. Open something from a feed and it appears here.')}
        </p>
      </div>
    );
  }

  const item = selected ? R.getItem(selected) : null;
  return (
    <div className="rm">
      <div className="rm-head">
        <span className="rm-count">{tp(pieces.length, '{n} item read or seen', '{n} items read or seen')} · {tp(stats.fields || 0, '{n} field', '{n} fields')} · {t('{n} topics', { n: stats.topics })}</span>
        {tag.state && <span className="rm-tagging">{tag.state}</span>}
        {focus && (
          <button className="rm-focus" onClick={() => setFocus(null)}>
            {t('showing {what}', { what: <b>{focus.kind === 'field' ? fieldName(focus.value) : focus.value}</b> })} <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div className="rm-canvas-wrap">
        <div ref={canvas} className="rm-canvas" onClick={onClick} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {item ? <ItemDetail item={item} threads={threads} onTopic={focusTopic} focus={focus} onClose={() => setSelected(null)} />
        : <p className="rm-hint" data-scroll-hint={t('Scroll the floor sideways. ')}>{t("Click a stone to see the item and open it. Click a field's name, a seam or a topic below to light up everything that shares it.")}</p>}
      <Legend model={model} />
      <Spread stats={stats} threads={threads} onTopic={focusTopic} focus={focus} />
    </div>
  );
}

// Tag items that have no field/topics yet (older records), once per visit.
function useTagging(items) {
  const [state, setState] = useState('');
  const need = items.filter((i) => engaged(i) && !i.topics?.length && !i.tagFailed).length;
  const started = useRef(false);
  useEffect(() => {
    if (!need || started.current) return;
    started.current = true;
    tagUntagged((done, total) => setState(done < total ? t('sorting {n} items into fields…', { n: total - done }) : ''))
      .then(() => setState(''))
      .catch(() => setState(''));
  }, [need]);
  return { state };
}

function ItemDetail({ item, threads, onTopic, focus, onClose }) {
  const th = threads.find((x) => x.id === item.threadId);
  return (
    <div className="rm-detail">
      <MediaChip type={item.mediaType} url={item.url} size={16} />
      <div className="rm-detail-body">
        <div className="rm-detail-title">{item.title}</div>
        <div className="rm-detail-meta">
          {[item.source, item.field && fieldName(item.field), item.signal && SIGNAL_WORDS[item.signal], item.kept && t('kept'), progressText(item.progress)].filter(Boolean).join(' · ')}
        </div>
        {!!item.topics?.length && (
          <div className="rm-topics">
            {item.topics.map((tp) => (
              <button key={tp} className={`rm-topic ${focus?.value === tp ? 'on' : ''}`} onClick={() => onTopic(tp)}>{tp}</button>
            ))}
          </div>
        )}
        {(item.notes || []).slice(-2).map((n) => <p key={n.at} className="rm-note">“{n.text}”</p>)}
        <div className="rm-detail-actions">
          <OpenButton item={item} onOpen={() => R.patchItem(item.id, (i) => ({ openedAt: i.openedAt || Date.now() }))} />
          {th && <a className="rm-thread" href={'#' + threadPath(th.id)}>{t('From: {question}', { question: R.currentArticulation(th) })}</a>}
        </div>
      </div>
      <button className="rm-x" onClick={onClose} aria-label={t('Close')}><Icon name="x" size={14} /></button>
    </div>
  );
}

function Legend({ model }) {
  const hue = model.fields.find((f) => f.name !== UNSORTED)?.hue ?? 200;
  const tile = (fill, dash) => (
    <svg viewBox="0 0 38 38" width="22" height="22" aria-hidden="true">
      <path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill={fill} stroke="rgba(38,30,20,0.45)" strokeWidth="1" strokeLinejoin="round" strokeDasharray={dash} />
    </svg>
  );
  const rows = [
    ['moved', tile(tessera(hue, KINDS.moved.t, 0)), t('Dark'), t('an item that moved you (✦).')],
    ['kept', tile(tessera(hue, KINDS.kept.t, 0)), t('Middling'), t('an item you kept or wrote a note on.')],
    ['read', tile(tessera(hue, KINDS.read.t, 0)), t('Pale'), t('an item you opened, rated or marked neutral.')],
    ['closed', tile('hsl(40 34% 91%)', '2.5 2.2'), t('Dashed parchment'), t('an item that closed the question down.')],
  ];
  return (
    <div className="rm-legend">
      {rows.map(([k, sw, label, body]) => (
        <div className="rm-legend-row" key={k}><span className="rm-swatch">{sw}</span><span><b>{label}</b>: {body}</span></div>
      ))}
      <div className="rm-legend-row"><span className="rm-swatch rm-swatch-wide">
        <svg viewBox="0 0 114 38" width="66" height="22" aria-hidden="true">
          {[[14, 0.4], [44, 0.65], [86, 1]].map(([cx, k]) => (
            <path key={cx} transform={`translate(${cx} 19) scale(${k}) translate(-19.5 -18.5)`} d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z"
              fill={tessera(hue, KINDS.kept.t, 0)} stroke="rgba(38,30,20,0.45)" strokeWidth={1 / k} strokeLinejoin="round" />
          ))}
        </svg></span>
        <span>{t("{label}: how long the item is, from a short clip to a long lecture or a dense long read. Middling when Mosaic doesn't know the length yet (it learns it when you open the item in the reader).", { label: <b>{t('Size')}</b> })}</span></div>
      <div className="rm-legend-row"><span className="rm-swatch"><svg viewBox="0 0 38 38" width="22" height="22"><line x1="4" y1="19" x2="34" y2="19" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" /></svg></span>
        <span>{t('{label}: two fields that share topics. Thicker means more in common.', { label: <b>{t('Brass seam')}</b> })}</span></div>
      <div className="rm-legend-row"><span className="rm-swatch rm-swatch-wide">
        <svg viewBox="0 0 114 38" width="66" height="22" aria-hidden="true">
          <defs><pattern id="rm-lg-tx" patternUnits="userSpaceOnUse" width="4.4" height="4.4" patternTransform="rotate(35)"><path d="M0,2.2H4.4" stroke={tessera(hue, KINDS.kept.t, 0)} strokeWidth="1.2" /></pattern></defs>
          {[0, 38, 76].map((dx, k) => (
            <g key={k} transform={`translate(${dx} 0)`}>
              <path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill={k === 2 ? tessera(hue, KINDS.kept.t, 0) : 'hsl(40 32% 93%)'} stroke="rgba(38,30,20,0.4)" strokeWidth="1" strokeLinejoin="round" />
              {k === 1 && <path d="M5,19 L12,7 L27,6 L34,18 L27,31 L11,31 Z" fill="url(#rm-lg-tx)" />}
              {k < 2 && <path d="M7.5,19 L13.3,9 L25.8,8.2 L31.6,18 L25.8,28.8 L12.2,28.8 Z" fill="none" stroke={tessera(hue, KINDS.kept.t, 0)} strokeWidth="1.8" strokeLinejoin="round" />}
            </g>
          ))}
        </svg></span>
        <span>{t('{label}: how much of it you finished. An outline: just opened. Hatched or stippled: partway, denser the further you got. Fully coloured: finished (85% played, or read through at a pace that fits how dense it is), or opened before Mosaic tracked it.', { label: <b>{t('Outline → shaded → full')}</b> })}</span></div>
      <div className="rm-legend-row"><span className="rm-swatch rm-swatch-ic"><Icon name="video" size={16} /></span>
        <span>{t('{label}: what the item is (article, video, podcast…).', { label: <b>{t('Icon in a stone')}</b> })}</span></div>
      <p className="rm-key">{t("One stone per item, one panel per field; the hue is the field's. Stones on the same topic are laid side by side.")}</p>
    </div>
  );
}

const TREND = {
  get early() { return t('Too early to say'); },
  get spreading() { return t('Spreading out'); },
  get narrowing() { return t('Narrowing in'); },
  get steady() { return t('Holding steady'); },
};

// Say which way each measure went, the last 30 days against before.
function trendWords(st) {
  if (st.trend === 'early') return t('There isn’t enough history yet to compare the last 30 days with before.');
  const b0 = st.earlier.breadth, b1 = st.recent.breadth;
  const n0 = 1 - (st.earlier.overlap ?? 0), n1 = 1 - (st.recent.overlap ?? 0);
  const fields = t('{how} ({from} → {to} fields’ worth)', { how: Math.abs(b1 - b0) < 0.6 ? t('about as many fields') : b1 > b0 ? t('more fields') : t('fewer fields'), from: b0.toFixed(1), to: b1.toFixed(1) });
  const topics = t('{how} ({from} → {to} new)', { how: Math.abs(n1 - n0) < 0.15 ? t('a similar share of new topics') : n1 > n0 ? t('more new topics') : t('more familiar topics'), from: pct(n0), to: pct(n1) });
  return t('The last 30 days against before: {fields}, and {topics}.', { fields, topics });
}

function Spread({ stats, threads, onTopic, focus }) {
  const trendLabel = TREND[stats.trend];
  const tname = (id) => R.currentArticulation(threads.find((t) => t.id === id));
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.fresh + w.familiar));
  const topicBtn = (t, extra) => (
    <button key={t} className={`rm-topic ${focus?.value === t ? 'on' : ''}`} onClick={() => onTopic(t)}>{t}{extra}</button>
  );
  if (!stats.tagged) return <p className="muted rm-small">{t('The overlap and spread numbers appear once items are sorted into fields.')}</p>;
  return (
    <div className="rm-spread">
      <div className="rm-stats">
        <div className="rm-stat">
          <div className="rm-stat-n">{pct(stats.recent.n ? stats.recent.overlap : stats.overlap)}</div>
          <div className="rm-stat-l">{t('familiar ground')}</div>
          <div className="rm-stat-b">{stats.recent.n
            ? t('of the topics in what you read in the last 30 days were ones you’d already met. The rest was new.')
            : t('of the topics in what you read so far were ones you’d already met. The rest was new.')}</div>
        </div>
        <div className="rm-stat">
          <div className="rm-stat-n">{stats.breadth ? stats.breadth.toFixed(1) : '–'}</div>
          <div className="rm-stat-l">{t('fields’ worth')}</div>
          <div className="rm-stat-b">{t('how widely your reading is spread: 1 if it were all one field, higher when it is shared evenly across several.')}</div>
        </div>
        <div className="rm-stat">
          <div className="rm-stat-n rm-stat-word">{trendLabel}</div>
          <div className="rm-stat-l">{t('direction')}</div>
          <div className="rm-stat-b">{trendWords(stats)}</div>
        </div>
      </div>

      <div className="rm-weeks" aria-label={t('New and familiar topics per week, last 12 weeks')}>
        <div className="rm-weeks-bars">
          {stats.weeks.map((w) => (
            <div className="rm-week" key={w.start} title={t('Week of {date}: {items} items, {fresh} new topics, {familiar} familiar', { date: new Date(w.start).toLocaleDateString(loc(), { month: 'short', day: 'numeric' }), items: w.items, fresh: w.fresh, familiar: w.familiar })}>
              <span className="rm-bar fresh" style={{ height: `${(w.fresh / maxWeek) * 100}%` }} />
              <span className="rm-bar familiar" style={{ height: `${(w.familiar / maxWeek) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="rm-weeks-key"><span><i className="fresh" /> {t('new topics')}</span><span><i className="familiar" /> {t('familiar topics')}</span><span className="muted">{t('per week, last 12 weeks')}</span></div>
      </div>

      <div className="rm-cols">
        <div>
          <h4>{t('Where your reading overlaps')}</h4>
          {stats.crossThread.length ? (
            <ul className="rm-list">
              {stats.crossThread.map((x) => (
                <li key={x.topic}>{topicBtn(x.topic)} <span className="muted">{t('comes up in {n} threads', { n: x.threads.length })}</span></li>
              ))}
            </ul>
          ) : <p className="muted rm-small">{t('No topic has come up in more than one thread yet.')}</p>}
          {stats.threadPairs.length > 0 && (
            <ul className="rm-pairs">
              {stats.threadPairs.slice(0, 3).map((p) => (
                <li key={p.a + p.b}>
                  <span className="rm-pair-pct">{pct(p.jaccard)}</span>
                  <span><a href={'#' + threadPath(p.a)}>{tname(p.a)}</a> <span className="muted">{t('and')}</span> <a href={'#' + threadPath(p.b)}>{tname(p.b)}</a> <span className="muted">{t('share {topics}', { topics: p.shared.slice(0, 3).join(', ') })}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>{t('Topics that cross fields')}</h4>
          {stats.bridges.length ? (
            <ul className="rm-list">
              {stats.bridges.map((b) => (
                <li key={b.topic}>{topicBtn(b.topic)} <span className="muted">{b.fields.map(fieldName).join(' · ')}</span></li>
              ))}
            </ul>
          ) : <p className="muted rm-small">{t('Each topic so far stays inside one field.')}</p>}
        </div>
        <div>
          <h4>{t('What you read, watch and hear')}</h4>
          <ul className="rm-media">
            {stats.media.map(([type, n]) => (
              <li key={type}><MediaChip type={type} /> <span>{MEDIA[type]?.label}</span> <span className="rm-media-n">{n}</span></li>
            ))}
          </ul>
          <p className="muted rm-small">
            {Object.entries(stats.families).map(([f, n]) => `${FAMILY[f].label.toLowerCase()} ${Math.round((n / stats.items) * 100)}%`).join(' · ')}
          </p>
        </div>
      </div>
      {stats.topTopics.length > 0 && (
        <div className="rm-top">
          <h4>{t('Most-visited topics')}</h4>
          <div className="rm-topics">{stats.topTopics.map((x) => topicBtn(x.topic, <span className="rm-topic-n">{x.n}</span>))}</div>
        </div>
      )}
    </div>
  );
}

