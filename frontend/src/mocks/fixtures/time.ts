const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** ISO timestamp offset from `now`, keeping relative-time fixtures stable. */
export function fromNow(
  now: number,
  offset: { days?: number; hours?: number; minutes?: number; seconds?: number },
) {
  const { days = 0, hours = 0, minutes = 0, seconds = 0 } = offset;
  return new Date(
    now + days * DAY + hours * HOUR + minutes * MINUTE + seconds * 1_000,
  ).toISOString();
}
