const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type RelativeTimeStyle = "long" | "short";

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

/**
 * Formats a past timestamp relative to `now`.
 * long:  "just now", "10 min ago", "2 hours ago", "3 days ago"
 * short: "now", "10m ago", "2h ago", "3d ago"
 */
export function formatRelativeTime(
  timestamp: string | number | Date,
  now: number,
  style: RelativeTimeStyle = "long",
): string {
  const elapsed = Math.max(0, now - new Date(timestamp).getTime());

  if (elapsed < MINUTE) return style === "long" ? "just now" : "now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return style === "long" ? `${minutes} min ago` : `${minutes}m ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return style === "long" ? `${plural(hours, "hour")} ago` : `${hours}h ago`;
  }
  const days = Math.floor(elapsed / DAY);
  return style === "long" ? `${plural(days, "day")} ago` : `${days}d ago`;
}
