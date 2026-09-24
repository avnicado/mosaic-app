// Asking an embedded player where it is. Each bridge talks to the site's own
// player over postMessage (Spotify: its iFrame API script) and reports
// emit({ pos, dur, playing }) — seconds; any field may be missing. A player
// that can't be asked (TED, Dailymotion, Apple) has no bridge: the tracker
// then falls back to an estimate.

const parse = (d) => { try { return typeof d === 'string' ? JSON.parse(d) : d; } catch { return null; } };

// Listen to messages from this iframe only; say hello until it answers.
function bridge(iframe, hello, onData) {
  let heard = false, tries = 0;
  const say = () => { if (iframe.contentWindow) hello((o) => iframe.contentWindow.postMessage(JSON.stringify(o), new URL(iframe.src).origin)); };
  const timer = setInterval(() => { if (heard || ++tries > 30) clearInterval(timer); else say(); }, 700);
  const onMsg = (e) => {
    if (e.source !== iframe.contentWindow) return;
    const d = parse(e.data);
    if (!d) return;
    heard = true;
    onData(d, say);
  };
  window.addEventListener('message', onMsg);
  iframe.addEventListener('load', say);
  return () => { clearInterval(timer); window.removeEventListener('message', onMsg); iframe.removeEventListener('load', say); };
}

// YouTube: after "listening", the player streams infoDelivery (currentTime,
// duration, playerState: 1 playing, 2 paused, 0 ended, 3 buffering).
function youtube(iframe, emit) {
  return bridge(iframe,
    (post) => {
      post({ event: 'listening', id: 'mosaic', channel: 'widget' });
      post({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'mosaic', channel: 'widget' });
    },
    (d) => {
      if (d.event === 'onStateChange') emit({ playing: d.info === 1 });
      else if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && d.info) {
        const i = d.info;
        emit({
          pos: typeof i.currentTime === 'number' ? i.currentTime : undefined,
          dur: i.duration || undefined,
          playing: typeof i.playerState === 'number' ? i.playerState === 1 : undefined,
        });
      }
    });
}

// Vimeo: subscribe once the player says it's ready.
function vimeo(iframe, emit) {
  const sub = (post) => ['timeupdate', 'play', 'pause', 'ended'].forEach((value) => post({ method: 'addEventListener', value }));
  return bridge(iframe, sub, (d, say) => {
    if (d.event === 'ready') say();
    else if (d.event === 'timeupdate' && d.data) emit({ pos: d.data.seconds, dur: d.data.duration, playing: true });
    else if (d.event === 'play') emit({ playing: true });
    else if (d.event === 'pause' || d.event === 'ended') emit({ playing: false });
  });
}

// SoundCloud widget: positions come in milliseconds.
function soundcloud(iframe, emit) {
  const sub = (post) => {
    ['playProgress', 'play', 'pause', 'finish'].forEach((value) => post({ method: 'addEventListener', value }));
    post({ method: 'getDuration' });
  };
  return bridge(iframe, sub, (d, say) => {
    if (d.method === 'ready') say();
    else if (d.method === 'getDuration' && d.value) emit({ dur: d.value / 1000 });
    else if (d.method === 'playProgress' && d.value) {
      const { currentPosition: at, relativePosition: rel } = d.value;
      emit({ pos: at / 1000, dur: rel > 0.01 ? at / 1000 / rel : undefined, playing: true });
    } else if (d.method === 'play') emit({ playing: true });
    else if (d.method === 'pause' || d.method === 'finish') emit({ playing: false });
  });
}

export const BRIDGES = { youtube, vimeo, soundcloud };
export const canTrack = (embed) => !!(embed && (BRIDGES[embed.provider] || embed.provider === 'spotify'));

export function connectPlayer(iframe, embed, emit) {
  const b = BRIDGES[embed.provider];
  return b ? b(iframe, emit) : () => {};
}

// Spotify: the iFrame API builds the player itself inside `host`.
let spotifyApi = null;
function loadSpotify() {
  if (!spotifyApi) {
    spotifyApi = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Spotify player API did not load')), 8000);
      window.onSpotifyIframeApiReady = (api) => { clearTimeout(t); resolve(api); };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => { clearTimeout(t); reject(new Error('Spotify player API did not load')); };
      document.head.appendChild(s);
    }).catch((e) => { spotifyApi = null; throw e; });
  }
  return spotifyApi;
}

// → Promise<cleanup>; rejects when the API can't load (the reader then shows
// the plain embed and estimates).
export async function mountSpotify(host, embed, emit) {
  const api = await loadSpotify();
  const el = document.createElement('div');
  host.appendChild(el);
  let ctrl = null;
  await new Promise((resolve) => {
    api.createController(el, { uri: embed.uri, width: '100%', height: embed.height || 232 }, (c) => { ctrl = c; resolve(); });
  });
  ctrl.addListener('playback_update', (e) => {
    const d = e.data || {};
    emit({ pos: d.position / 1000, dur: d.duration ? d.duration / 1000 : undefined, playing: !d.isPaused && !d.isBuffering });
  });
  return () => { try { ctrl.destroy(); } catch { /* already gone */ } host.replaceChildren(); };
}
