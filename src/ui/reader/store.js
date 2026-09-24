// Which item the reader is showing. target: { itemId } for a feed item (the
// reader then offers ✦ / keep), or { url, title, source, mediaType } for
// anything else (a Promenade card).
let current = null;
const listeners = new Set();
export const subscribeReader = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getReader = () => current;
export function openReader(target) { current = target; listeners.forEach((fn) => fn()); }
export function closeReader() { current = null; listeners.forEach((fn) => fn()); }
