"use client";

import { useTickingNow } from "@/hooks/use-ticking-now";

const TICK_MS = 100;

type ClockReading = {
  /** Remaining time at the moment the snapshot arrived. */
  remainingMs: number;
  /** Whether this side's clock is currently running. */
  running: boolean;
  /** Browser time the snapshot arrived. */
  receivedAt: number;
};

/**
 * Remaining time for display. Between snapshots the running side's clock is
 * counted down locally so the face updates smoothly without polling. This is
 * presentation only: reaching zero here never ends the game; the server
 * decides timeouts and sends the result.
 */
export function useGameClock({ remainingMs, running, receivedAt }: ClockReading): number {
  const now = useTickingNow(running ? TICK_MS : null);
  if (!running) return remainingMs;
  return Math.max(0, remainingMs - Math.max(0, now - receivedAt));
}
