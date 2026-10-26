/** "in 12 min", "in 2 h", "now" for a future timestamp relative to `now`. */
export function formatTimeUntil(timestamp: string | number | Date, now: number): string {
  const remaining = new Date(timestamp).getTime() - now;
  if (remaining <= 0) return "now";
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}
