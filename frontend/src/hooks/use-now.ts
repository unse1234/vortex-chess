"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let current: number | null = null;

function getSnapshot() {
  // Cached between ticks so consecutive reads during a render agree.
  const time = Date.now();
  if (current === null || time - current >= TICK_MS) current = time;
  return current;
}

function subscribe(onTick: () => void) {
  const timer = window.setInterval(onTick, TICK_MS);
  return () => window.clearInterval(timer);
}

/**
 * Current time for relative-time displays, refreshed every 30 seconds.
 * Returns null while server rendering and hydrating, so prerendered output
 * never depends on the clock.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
