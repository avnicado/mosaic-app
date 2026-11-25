// What kind of thing an item is, and what you do with it. Pure; shared by the
// engine (prompts, tagging), the UI (chips, open buttons) and the mosaic.

import { t } from './i18n/index.js';

// Canonical media types. `family` is what you do with it: read, watch, listen,
// look at, or join in on.
// Labels are getters so they read in the interface language at the moment they're shown.
export const MEDIA = {
  article:   { family: 'read',   get label() { return t('Article'); } },
  essay:     { family: 'read',   get label() { return t('Essay'); } },
  paper:     { family: 'read',   get label() { return t('Paper'); } },
  book:      { family: 'read',   get label() { return t('Book'); } },
  reference: { family: 'read',   get label() { return t('Reference'); } },
  video:     { family: 'watch',  get label() { return t('Video'); } },
  lecture:   { family: 'watch',  get label() { return t('Lecture'); } },
  film:      { family: 'watch',  get label() { return t('Film'); } },
  podcast:   { family: 'listen', get label() { return t('Podcast'); } },
  interview: { family: 'listen', get label() { return t('Interview'); } },
  music:     { family: 'listen', get label() { return t('Music'); } },
  art:       { family: 'look',   get label() { return t('Art'); } },
  forum:     { family: 'talk',   get label() { return t('Discussion'); } },
  web:       { family: 'read',   get label() { return t('Web page'); } },
};
export const MEDIA_TYPES = Object.keys(MEDIA).filter((k) => k !== 'web');

export const FAMILY = {
  read:   { get verb() { return t('Read'); },   get label() { return t('Reading'); } },
  watch:  { get verb() { return t('Watch'); },  get label() { return t('Watching'); } },
  listen: { get verb() { return t('Listen'); }, get label() { return t('Listening'); } },
  look:   { get verb() { return t('View'); },   get label() { return t('Looking'); } },
  talk:   { get verb() { return t('Read the discussion'); }, get label() { return t('Discussion'); } },
};

// Older records and models use other words for the same things.
const ALIASES = {
  primer: 'reference', wikipedia: 'reference', encyclopedia: 'reference', entry: 'reference',
  classical: 'music', song: 'music', album: 'music',
  reddit: 'forum', thread: 'forum', discussion: 'forum', comments: 'forum',
  image: 'art', painting: 'art', photo: 'art', photograph: 'art', artwork: 'art', exhibition: 'art',
  documentary: 'film', movie: 'film',
  talk: 'lecture', course: 'lecture', lesson: 'lecture', ted: 'lecture',
  news: 'article', report: 'article', feature: 'article', magazine: 'article',
  blog: 'essay', post: 'essay', newsletter: 'essay', 'long-read': 'essay', longread: 'essay',
  study: 'paper', preprint: 'paper', journal: 'paper', research: 'paper',
  episode: 'podcast', audio: 'podcast', radio: 'podcast',
  conversation: 'interview',
  website: 'web', page: 'web', tool: 'web',
};

// The host says more than the model's guess: a youtube.com link is a video.
const HOSTS = [
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|nebula\.tv)$/, 'video'],
  [/(^|\.)ted\.com$/, 'lecture'],
  [/(^|\.)(open\.spotify\.com|podcasts\.apple\.com|overcast\.fm|pca\.st|podbean\.com|simplecast\.com|buzzsprout\.com|libsyn\.com)$/, 'podcast'],
  [/(^|\.)(arxiv\.org|doi\.org|ncbi\.nlm\.nih\.gov|jstor\.org|ssrn\.com|biorxiv\.org|psyarxiv\.com|philpapers\.org|semanticscholar\.org|sciencedirect\.com|link\.springer\.com|pubmed\.ncbi\.nlm\.nih\.gov)$/, 'paper'],
  [/(^|\.)(wikipedia\.org|britannica\.com|plato\.stanford\.edu|iep\.utm\.edu)$/, 'reference'],
  [/(^|\.)(reddit\.com|news\.ycombinator\.com|lesswrong\.com|metafilter\.com)$/, 'forum'],
  [/(^|\.)(gutenberg\.org|goodreads\.com|books\.google\.[a-z.]+|openlibrary\.org)$/, 'book'],
  [/(^|\.)(bandcamp\.com|soundcloud\.com)$/, 'music'],
];

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function normalizeMediaType(type, url = '') {
  const host = hostOf(url);
  // A Wikipedia page about a film is still a reference page.
  for (const [re, t] of HOSTS) if (host && re.test(host)) return t;
  const k = String(type || '').toLowerCase().trim().replace(/s$/, '');
  if (MEDIA[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  return 'article';
}

export const mediaInfo = (type, url) => {
  const t = normalizeMediaType(type, url);
  const m = MEDIA[t];
  return { type: t, family: m.family, label: m.label, verb: FAMILY[m.family].verb };
};

// Broad fields: a fixed list so panels in the mosaic stay stable and comparable.
export const FIELDS = [
  'philosophy', 'psychology', 'neuroscience', 'biology', 'medicine & health', 'physics',
  'mathematics', 'computing', 'engineering & design', 'economics', 'politics & law',
  'history', 'society & culture', 'language', 'education', 'literature', 'visual art',
  'music', 'film & media', 'religion', 'environment', 'business & work',
];

export function normalizeField(f) {
  const k = String(f || '').toLowerCase().trim();
  if (FIELDS.includes(k)) return k;
  const hit = FIELDS.find((x) => x.split(' & ').some((part) => k === part || k.startsWith(part)));
  return hit || null;
}

export function normalizeTopics(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const t = String(raw || '').toLowerCase().replace(/[“”"'‘’.#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 4) break;
  }
  return out;
}

// The JSON fields both item prompts ask for, and the vocabulary hint.
export const TAG_FIELDS_SPEC = `  "field": "the ONE broad field it belongs to, exactly one of: ${FIELDS.join(', ')}",
  "topics": ["2-4 short lowercase subject tags, general enough to recur across different items — e.g. 'attention', 'game theory', 'grief', 'urban planning'"]`;

export const vocabHint = (vocab = []) => (vocab.length
  ? `\nFor "topics", reuse these existing tags where they genuinely fit (add a new one only when none does): ${vocab.slice(0, 40).join(', ')}.`
  : '');
