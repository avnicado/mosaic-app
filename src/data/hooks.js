import { useSyncExternalStore, useMemo } from 'react';
import { subscribe, getVersion } from './record.js';
import { subscribeBusy, getBusyVersion, getBusy } from './actions.js';

// Re-render on any record change; `select` runs against localStorage.
export function useRecord(select, deps = []) {
  const v = useSyncExternalStore(subscribe, getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => select(), [v, ...deps]);
}

export function useBusy(threadId) {
  const v = useSyncExternalStore(subscribeBusy, getBusyVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getBusy(threadId), [v, threadId]);
}
