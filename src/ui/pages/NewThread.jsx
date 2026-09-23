// New thread (#/new). Write what you're holding, or start from an image.
// #/new?text=… prefills; #/new?from=<itemId> pursues a feed item (the new
// thread keeps its lineage).
import React, { useState, useRef, useEffect } from 'react';
import '../thread/thread.css';
import './newthread.css';
import * as R from '../../data/record.js';
import * as A from '../../data/actions.js';
import { Spinner, SlotTag, hostOf } from '../kit.jsx';
import { go, threadPath } from '../router.js';

// Downscale in the browser before the image goes into any request: re-encode
// to JPEG at ≤ maxSide px (upscaling anything under 32px), flattening alpha
// onto white. thumbnail is a small data URL that fits in the record.
export async function prepareImage(file, maxSide = 1536) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("This image format can't be read by the browser (try a JPG or PNG)."));
      im.src = url;
    });
    const encode = (side, quality) => {
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      let scale = Math.min(1, side / Math.max(w0, h0));
      if (Math.min(w0, h0) * scale < 32) scale = 32 / Math.min(w0, h0);
      const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', quality);
    };
    const dataUrl = encode(maxSide, 0.85);
    return { base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', thumbnail: encode(320, 0.7) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ImageStart({ onPick, image, setImage }) {
  const [note, setNote] = useState('');
  const [state, setState] = useState({ phase: image ? 'ready' : 'idle' }); // idle | preparing | ready | reading | done | error
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState(null);
  const fileRef = useRef(null);

  const onFile = async (f) => {
    if (!f) return;
    setState({ phase: 'preparing' }); setResult(null); setPicked(null);
    try { const img = await prepareImage(f); setImage({ ...img, observation: '' }); setState({ phase: 'ready' }); }
    catch (e) { setImage(null); setState({ phase: 'error', error: e.message }); }
  };
  const analyze = async () => {
    setState({ phase: 'reading' });
    try {
      const r = await A.readImage(image, note.trim());
      setResult(r); setImage({ ...image, observation: r.observation }); setState({ phase: 'done' });
    } catch (e) { setState({ phase: 'error', error: e.message }); }
  };
  const clear = () => { setImage(null); setResult(null); setPicked(null); setState({ phase: 'idle' }); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <div className="nt-image">
      <input ref={fileRef} type="file" accept="image/*" className="nt-file" id="nt-file" onChange={(e) => onFile(e.target.files?.[0])} />
      {!image && state.phase !== 'preparing' && (
        <div className="nt-drop">
          <label htmlFor="nt-file" className="btn">Choose an image…</label>
          <span className="th-hint">A photo, a screenshot, a page of a book. It's scaled down before it's sent.</span>
          {state.phase === 'error' && <div className="error nt-mt">{state.error}</div>}
        </div>
      )}
      {state.phase === 'preparing' && <div className="th-hint"><Spinner /> Preparing the image…</div>}
      {image && (
        <div className="nt-imgwork">
          <figure className="nt-thumb">
            <img src={image.thumbnail} alt="Your image" />
            <button className="btn link" onClick={clear}>Remove</button>
          </figure>
          <div className="nt-imgside">
            {state.phase !== 'done' && (
              <>
                <label className="label" htmlFor="nt-note">What drew you to it? <span className="muted">(optional)</span></label>
                <input id="nt-note" className="field nt-note" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="The light, a detail, something that doesn't fit…"
                  onKeyDown={(e) => { if (e.key === 'Enter') analyze(); }} />
                <div className="th-row">
                  <button className="btn" disabled={state.phase === 'reading'} onClick={analyze}>
                    {state.phase === 'reading' ? <><Spinner /> Looking at it…</> : state.phase === 'error' ? 'Try again' : 'Suggest questions'}
                  </button>
                  {state.phase === 'reading' && <span className="th-hint">About 10 seconds.</span>}
                </div>
                {state.phase === 'error' && <div className="error nt-mt">Couldn't read the image: {state.error}</div>}
              </>
            )}
            {state.phase === 'done' && result && (
              <>
                <div className="label">What's in it</div>
                <p className="nt-obs">{result.observation}</p>
                <div className="label nt-mt">Questions it could hold · pick one, then make it yours</div>
                <ul className="nt-cands">
                  {result.candidates.map((c, i) => (
                    <li key={i}>
                      <button className={`nt-cand ${picked === i ? 'on' : ''}`} onClick={() => { setPicked(i); onPick(c.question); }}>
                        <span className="nt-angle">{c.angle}</span>
                        <span className="nt-cq">{c.question}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="btn link" onClick={() => { setResult(null); setState({ phase: 'ready' }); }}>Ask again with a different note</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewThread({ query = {} }) {
  const fromItem = query.from ? R.getItem(query.from) : null;
  const fromThread = fromItem ? R.getThread(fromItem.threadId) : null;
  const [text, setText] = useState(query.text || '');
  const [image, setImage] = useState(null);
  const [showImage, setShowImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const taRef = useRef(null);
  useEffect(() => { taRef.current?.focus(); }, []);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      let id;
      if (fromItem) id = await A.spawnFromItem(fromItem.id, text);
      else id = await A.createThread({ text, image: image && showImage ? image : null });
      go(threadPath(id));
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const pick = (q) => { setText(q); setTimeout(() => { const el = taRef.current; if (el) { el.focus(); el.setSelectionRange(q.length, q.length); } }, 0); };

  return (
    <div className="page nt-page">
      {fromItem ? (
        <div className="nt-from">
          <div className="eyebrow">Pursue</div>
          <p className="nt-from-line">↳ from <a href={'#' + threadPath(fromThread?.id)}>{fromThread ? R.currentArticulation(fromThread) : 'a thread'}</a></p>
          <div className={`nt-from-item slot-${fromItem.slot}`}>
            <SlotTag slot={fromItem.slot} />
            <a href={fromItem.url} target="_blank" rel="noopener noreferrer">{fromItem.title}</a>
            <span className="th-hint">{fromItem.source || hostOf(fromItem.url)}</span>
          </div>
        </div>
      ) : <div className="eyebrow">New thread</div>}

      <label htmlFor="nt-text" className="nt-q-label">{fromItem ? "What's the question this opens?" : 'What are you holding?'}</label>
      <textarea id="nt-text" ref={taRef} className="nt-text" rows={4} value={text}
        placeholder={fromItem ? 'Write it the way you’d say it.' : 'Write it the way you’d say it.'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} />
      <p className="nt-hint">A question, a hunch, an observation, or “show me…”. It doesn't need to be well put; you'll restate it as it moves.</p>

      <div className="nt-actions">
        <button className="btn primary" disabled={!text.trim() || busy} onClick={submit}>{busy ? <Spinner /> : null}{fromItem ? 'Start the thread' : 'Start thread'}</button>
        <span className="th-hint">⌘/Ctrl + Enter</span>
        <span className="th-spacer" />
        {!fromItem && !showImage && <button className="btn link" onClick={() => setShowImage(true)}>Start from an image instead</button>}
      </div>
      {err && <div className="error nt-mt">{err}</div>}

      {!fromItem && showImage && (
        <section className="nt-imgsec">
          <div className="nt-imgsec-head">
            <span className="label">Start from an image</span>
            <button className="btn link" onClick={() => { setShowImage(false); setImage(null); }}>Close</button>
          </div>
          <ImageStart image={image} setImage={setImage} onPick={pick} />
        </section>
      )}

      <p className="nt-after">When you start, the question is read back to you — what it takes for granted, what it leaves out — and a first feed of four items fills in. You can correct the reading at any point.</p>
    </div>
  );
}
