"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Current time that re-renders its component every `intervalMs` while
 * `intervalMs` is set (pass `null` to pause). Values are aligned to the
 * interval so consecutive reads within a render agree. Returns 0 on the server.
 */
export function useTickingNow(intervalMs: number | null): number {
  const subscribe = useCallback(
    (onTick: () => void) => {
      if (intervalMs === null) return () => {};
      const timer = window.setInterval(onTick, intervalMs);
      return () => window.clearInterval(timer);
    },
    [intervalMs],
  );

  return useSyncExternalStore(
    subscribe,
    () => (intervalMs === null ? 0 : Math.floor(Date.now() / intervalMs) * intervalMs),
    () => 0,
  );
}
