// Quiet threads. A thread is quiet after 30 days untouched (R.isDormant). Quiet
// is data, not failure: nothing is lost, nothing counts against anyone, and
// there are no streaks. The only thing Mosaic does is offer, once per quiet
// spell, to pick one thread up again.
import * as R from './record.js';

// The one quiet thread worth offering back, or null. Prefers the thread that
// really moved most before it went quiet, then the most recently touched.
// "Once per spell": an answered offer (thread.returnOffer.at) hides the thread
// until it has been touched again and gone quiet a second time.
export function returnOffer(threads, sessions, now = Date.now()) {
  const real = new Map();
  for (const s of sessions) if (s.closedAt && s.diff?.verdict === 'real') real.set(s.threadId, (real.get(s.threadId) || 0) + 1);
  const eligible = threads.filter((t) => R.isDormant(t, now) && !(t.returnOffer && t.returnOffer.at > (t.touchedAt || t.createdAt)));
  eligible.sort((a, b) => (real.get(b.id) || 0) - (real.get(a.id) || 0) || (b.touchedAt || b.createdAt) - (a.touchedAt || a.createdAt));
  const t = eligible[0];
  return t ? { thread: t, real: real.get(t.id) || 0, quietSince: t.touchedAt || t.createdAt } : null;
}

// did: 'opened' | 'later'. Does not touch the thread, so it stays quiet until it is really used.
export const answerReturnOffer = (threadId, did) => R.patchThread(threadId, { returnOffer: { at: Date.now(), did } });
