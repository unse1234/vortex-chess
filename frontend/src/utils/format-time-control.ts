import type { TimeControl } from "@/types/time-control.types";

/** "BLITZ 3+2": category, whole minutes of base time, increment in seconds. */
export function formatTimeControl({ category, initialMs, incrementMs }: TimeControl): string {
  const minutes = Math.round(initialMs / 60_000);
  const seconds = Math.round(incrementMs / 1_000);
  return `${category.toUpperCase()} ${minutes}+${seconds}`;
}

/** Clock face text, e.g. 222000 → "03:42"; under ten seconds adds tenths, e.g. "00:07.4". */
export function formatClock(milliseconds: number): string {
  const remaining = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(remaining / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (remaining < 10_000) return `${base}.${Math.floor((remaining % 1_000) / 100)}`;
  return base;
}
