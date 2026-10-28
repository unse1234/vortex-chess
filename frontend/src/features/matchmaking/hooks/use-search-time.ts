"use client";
import { useSyncExternalStore } from "react";

const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};
const snapshot = () => Math.floor(Date.now() / 1000);
/** Isolated one-second display timer; never controls queue expiry. */
export function useSearchTime(queuedAt: string | null) {
  const now = useSyncExternalStore(subscribe, snapshot, () => null);
  return queuedAt && now ? Math.max(0, now - Math.floor(Date.parse(queuedAt) / 1000)) : 0;
}
