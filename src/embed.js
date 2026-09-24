// Which links can play inside Mosaic through the site's own embed player.
// → { src, kind: 'video' | 'audio', height? } or null (then the reader tries
// the article, or offers the site).

const idOf = (u, re) => (u.pathname.match(re) || [])[1];

export function embedFor(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');

  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
      : u.searchParams.get('v') || idOf(u, /^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
    if (!id) {
      const list = u.searchParams.get('list');
      return list ? { kind: 'video', src: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}` } : null;
    }
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    const start = t ? (/^\d+$/.test(t) ? t : String((+(t.match(/(\d+)h/)?.[1] || 0)) * 3600 + (+(t.match(/(\d+)m/)?.[1] || 0)) * 60 + (+(t.match(/(\d+)s/)?.[1] || 0)))) : '';
    return { kind: 'video', src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0${start ? '&start=' + start : ''}` };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = idOf(u, /\/(?:video\/)?(\d{5,})/);
    return id ? { kind: 'video', src: `https://player.vimeo.com/video/${id}?dnt=1` } : null;
  }
  if (host === 'ted.com') {
    const slug = idOf(u, /^\/talks\/([\w-]+)/);
    return slug ? { kind: 'video', src: `https://embed.ted.com/talks/${slug}` } : null;
  }
  if (host === 'dailymotion.com') {
    const id = idOf(u, /^\/video\/(\w+)/);
    return id ? { kind: 'video', src: `https://www.dailymotion.com/embed/video/${id}` } : null;
  }
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(?:intl-\w+\/)?(episode|show|track|album|playlist)\/(\w+)/);
    return m ? { kind: 'audio', src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: m[1] === 'track' || m[1] === 'episode' ? 232 : 352 } : null;
  }
  if (host === 'podcasts.apple.com' || host === 'music.apple.com') {
    return { kind: 'audio', src: `https://embed.${host}${u.pathname}${u.search}`, height: u.searchParams.get('i') ? 175 : 450 };
  }
  if (host === 'soundcloud.com') {
    return { kind: 'audio', src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&visual=false`, height: 166 };
  }
  return null;
}
