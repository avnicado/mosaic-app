// Which version's notes this person has seen. Stored under an "m2:" key, so
// it syncs with the record: reading What's new on one device clears the dot
// on the others.
import { useSyncExternalStore } from 'react';
import { CURRENT_VERSION, compareVersions } from '../releases.js';

const KEY = 'm2:whatsnew-seen';
const listeners = new Set();

function read() {
  try { return window.localStorage.getItem(KEY) || ''; } catch { return ''; }
}

function subscribe(fn) {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => { listeners.delete(fn); window.removeEventListener('storage', fn); };
}

export function useSeenVersion() {
  return useSyncExternalStore(subscribe, read);
}

// True while there's a version newer than the last one this person read about.
export function useHasUnseen() {
  return compareVersions(CURRENT_VERSION, useSeenVersion()) > 0;
}

export function markSeen() {
  if (compareVersions(CURRENT_VERSION, read()) <= 0) return;
  try { window.localStorage.setItem(KEY, CURRENT_VERSION); } catch {}
  listeners.forEach((fn) => fn());
}
