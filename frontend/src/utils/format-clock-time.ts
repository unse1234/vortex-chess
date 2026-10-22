const formatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Local wall-clock time of an ISO timestamp, e.g. "14:02". */
export function formatClockTime(timestamp: string): string {
  return formatter.format(new Date(timestamp));
}
