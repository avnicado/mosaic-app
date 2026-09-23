// Tiny hash router: #/ (desk), #/new, #/t/<id>, #/promenade, #/library, #/settings.
import { useSyncExternalStore } from 'react';

const subscribe = (fn) => { window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn); };
const snapshot = () => window.location.hash || '#/';

export function parseRoute(hash) {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(hash.split('?')[1] || ''));
  if (!parts.length) return { name: 'desk', query };
  if (parts[0] === 't' && parts[1]) return { name: 'thread', id: parts[1], query };
  if (parts[0] === 's' && parts[1] && parts[2]) return { name: 'shared', userId: parts[1], id: parts[2], query };
  return { name: parts[0], query };
}

export function useRoute() {
  return parseRoute(useSyncExternalStore(subscribe, snapshot));
}

export function go(path) {
  const next = '#' + (path.startsWith('/') ? path : '/' + path);
  if (window.location.hash !== next) window.location.hash = next;
}

export const threadPath = (id) => `/t/${id}`;
export const sharedPath = (userId, id) => `/s/${userId}/${id}`;
