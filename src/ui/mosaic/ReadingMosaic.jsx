// The Library's mosaic: one stone per item you've read or seen, grouped by
// field, with the topics that recur laid together and the fields that share
// topics seamed together. Below it: how much of your reading overlaps, and
// whether you're spreading out.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as R from '../../data/record.js';
import { tagUntagged, engaged } from '../../data/actions.js';
import { threadPath } from '../router.js';
import { Icon, MediaChip, OpenButton } from '../icons.jsx';
import { MEDIA, FAMILY } from '../../media.js';
import { piecesFrom, fieldsFrom, spreadStats, KINDS, topicSlug, UNSORTED } from './model.js';
import { buildReadingMosaic } from './build.js';
import { tessera } from './geometry.js';
import './mosaic.css';

const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const SIGNAL_WORDS = { moved: '✦ moved you', neutral: '○ neutral', closed: '– closed it down' };

export default function ReadingMosaic({ threads, items }) {
  const pieces = useMemo(() => piecesFrom(items, threads), [items, threads]);
  const model = useMemo(() => fieldsFrom(pieces), [pieces]);
  const stats = useMemo(() => spreadStats(pieces, threads), [pieces, threads]);
  const svg = useMemo(() => buildReadingMosaic(model), [model]);
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
          The mosaic is laid from what you actually read and watch: every item you open, mark, keep or note becomes a stone.
          Nothing yet. Open something from a feed and it appears here.
        </p>
      </div>
    );
  }

  const item = selected ? R.getItem(selected) : null;
  return (
    <div className="rm">
      <div className="rm-head">
        <span className="rm-count">{pieces.length} {pieces.length === 1 ? 'item' : 'items'} read or seen · {stats.fields || 0} {stats.fields === 1 ? 'field' : 'fields'} · {stats.topics} topics</span>
        {tag.state && <span className="rm-tagging">{tag.state}</span>}
        {focus && (
          <button className="rm-focus" onClick={() => setFocus(null)}>
            showing <b>{focus.value}</b> <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div className="rm-canvas-wrap">
        <div ref={canvas} className="rm-canvas" onClick={onClick} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {item ? <ItemDetail item={item} threads={threads} onTopic={focusTopic} focus={focus} onClose={() => setSelected(null)} />
        : <p className="rm-hint">Click a stone to see the item and open it. Click a field's name, a seam or a topic below to light up everything that shares it.</p>}
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
    tagUntagged((done, total) => setState(done < total ? `sorting ${total - done} items into fields…` : ''))
      .then(() => setState(''))
      .catch(() => setState(''));
  }, [need]);
  return { state };
}

function ItemDetail({ item, threads, onTopic, focus, onClose }) {
  const t = threads.find((x) => x.id === item.threadId);
  return (
    <div className="rm-detail">
      <MediaChip type={item.mediaType} url={item.url} size={16} />
      <div className="rm-detail-body">
        <div className="rm-detail-title">{item.title}</div>
        <div className="rm-detail-meta">
          {[item.source, item.field, item.signal && SIGNAL_WORDS[item.signal], item.kept && 'kept'].filter(Boolean).join(' · ')}
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
          {t && <a className="rm-thread" href={'#' + threadPath(t.id)}>From: {R.currentArticulation(t)}</a>}
        </div>
      </div>
      <button className="rm-x" onClick={onClose} aria-label="Close"><Icon name="x" size={14} /></button>
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
    ['moved', tile(tessera(hue, KINDS.moved.t, 0)), 'Large and dark', 'an item that moved you (✦).'],
    ['kept', tile(tessera(hue, KINDS.kept.t, 0)), 'Middling', 'an item you kept or wrote a note on.'],
    ['read', tile(tessera(hue, KINDS.read.t, 0)), 'Small and pale', 'an item you opened, rated or marked neutral.'],
    ['closed', tile('hsl(40 34% 91%)', '2.5 2.2'), 'Dashed parchment', 'an item that closed the question down.'],
  ];
  return (
    <div className="rm-legend">
      {rows.map(([k, sw, label, body]) => (
        <div className="rm-legend-row" key={k}><span className="rm-swatch">{sw}</span><span><b>{label}</b>: {body}</span></div>
      ))}
      <div className="rm-legend-row"><span className="rm-swatch"><svg viewBox="0 0 38 38" width="22" height="22"><line x1="4" y1="19" x2="34" y2="19" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" /></svg></span>
        <span><b>Brass seam</b>: two fields that share topics. Thicker means more in common.</span></div>
      <div className="rm-legend-row"><span className="rm-swatch rm-swatch-ic"><Icon name="video" size={16} /></span>
        <span><b>Icon in a stone</b>: what the item is (article, video, podcast…).</span></div>
      <p className="rm-key">One stone per item, one panel per field; the hue is the field's. Stones on the same topic are laid side by side.</p>
    </div>
  );
}

const TREND = {
  early: 'Too early to say',
  spreading: 'Spreading out',
  narrowing: 'Narrowing in',
  steady: 'Holding steady',
};

// Say which way each measure went, the last 30 days against before.
function trendWords(st) {
  if (st.trend === 'early') return 'There isn’t enough history yet to compare the last 30 days with before.';
  const b0 = st.earlier.breadth, b1 = st.recent.breadth;
  const n0 = 1 - (st.earlier.overlap ?? 0), n1 = 1 - (st.recent.overlap ?? 0);
  const fields = `${Math.abs(b1 - b0) < 0.6 ? 'about as many fields' : b1 > b0 ? 'more fields' : 'fewer fields'} (${b0.toFixed(1)} → ${b1.toFixed(1)} fields’ worth)`;
  const topics = `${Math.abs(n1 - n0) < 0.15 ? 'a similar share of new topics' : n1 > n0 ? 'more new topics' : 'more familiar topics'} (${pct(n0)} → ${pct(n1)} new)`;
  return `The last 30 days against before: ${fields}, and ${topics}.`;
}

function Spread({ stats, threads, onTopic, focus }) {
  const trendLabel = TREND[stats.trend];
  const tname = (id) => R.currentArticulation(threads.find((t) => t.id === id));
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.fresh + w.familiar));
  const topicBtn = (t, extra) => (
    <button key={t} className={`rm-topic ${focus?.value === t ? 'on' : ''}`} onClick={() => onTopic(t)}>{t}{extra}</button>
  );
  if (!stats.tagged) return <p className="muted rm-small">The overlap and spread numbers appear once items are sorted into fields.</p>;
  return (
    <div className="rm-spread">
      <div className="rm-stats">
        <div className="rm-stat">
          <div className="rm-stat-n">{pct(stats.recent.n ? stats.recent.overlap : stats.overlap)}</div>
          <div className="rm-stat-l">familiar ground</div>
          <div className="rm-stat-b">of the topics in what you read {stats.recent.n ? 'in the last 30 days' : 'so far'} were ones you’d already met. The rest was new.</div>
        </div>
        <div className="rm-stat">
          <div className="rm-stat-n">{stats.breadth ? stats.breadth.toFixed(1) : '–'}</div>
          <div className="rm-stat-l">fields’ worth</div>
          <div className="rm-stat-b">how widely your reading is spread: 1 if it were all one field, higher when it is shared evenly across several.</div>
        </div>
        <div className="rm-stat">
          <div className="rm-stat-n rm-stat-word">{trendLabel}</div>
          <div className="rm-stat-l">direction</div>
          <div className="rm-stat-b">{trendWords(stats)}</div>
        </div>
      </div>

      <div className="rm-weeks" aria-label="New and familiar topics per week, last 12 weeks">
        <div className="rm-weeks-bars">
          {stats.weeks.map((w) => (
            <div className="rm-week" key={w.start} title={`Week of ${new Date(w.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${w.items} items, ${w.fresh} new topics, ${w.familiar} familiar`}>
              <span className="rm-bar fresh" style={{ height: `${(w.fresh / maxWeek) * 100}%` }} />
              <span className="rm-bar familiar" style={{ height: `${(w.familiar / maxWeek) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="rm-weeks-key"><span><i className="fresh" /> new topics</span><span><i className="familiar" /> familiar topics</span><span className="muted">per week, last 12 weeks</span></div>
      </div>

      <div className="rm-cols">
        <div>
          <h4>Where your reading overlaps</h4>
          {stats.crossThread.length ? (
            <ul className="rm-list">
              {stats.crossThread.map((x) => (
                <li key={x.topic}>{topicBtn(x.topic)} <span className="muted">comes up in {x.threads.length} threads</span></li>
              ))}
            </ul>
          ) : <p className="muted rm-small">No topic has come up in more than one thread yet.</p>}
          {stats.threadPairs.length > 0 && (
            <ul className="rm-pairs">
              {stats.threadPairs.slice(0, 3).map((p) => (
                <li key={p.a + p.b}>
                  <span className="rm-pair-pct">{pct(p.jaccard)}</span>
                  <span><a href={'#' + threadPath(p.a)}>{tname(p.a)}</a> <span className="muted">and</span> <a href={'#' + threadPath(p.b)}>{tname(p.b)}</a> <span className="muted">share {p.shared.slice(0, 3).join(', ')}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4>Topics that cross fields</h4>
          {stats.bridges.length ? (
            <ul className="rm-list">
              {stats.bridges.map((b) => (
                <li key={b.topic}>{topicBtn(b.topic)} <span className="muted">{b.fields.join(' · ')}</span></li>
              ))}
            </ul>
          ) : <p className="muted rm-small">Each topic so far stays inside one field.</p>}
        </div>
        <div>
          <h4>What you read, watch and hear</h4>
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
          <h4>Most-visited topics</h4>
          <div className="rm-topics">{stats.topTopics.map((x) => topicBtn(x.topic, <span className="rm-topic-n">{x.n}</span>))}</div>
        </div>
      )}
    </div>
  );
}

