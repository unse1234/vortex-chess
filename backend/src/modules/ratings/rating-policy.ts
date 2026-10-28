/** Immutable calculation policy. A future policy gets a new version. */
export const ELO_V1 = Object.freeze({
  version: 'elo-v1',
  initialRating: 1200,
  kFactor: 32,
  provisionalGames: 10,
  ratingFloor: 100,
  scale: 400,
});
export const RATING_POOLS = ['bullet', 'blitz', 'rapid'] as const;
export type Pool = (typeof RATING_POOLS)[number];

/** Explicit exact-preset mapping; classical/custom/unlimited controls are casual. */
export const PRESET_POOLS: Readonly<Record<string, Pool>> = Object.freeze({
  '1+0': 'bullet',
  '2+1': 'bullet',
  '3+0': 'blitz',
  '3+2': 'blitz',
  '5+0': 'blitz',
  '5+3': 'blitz',
  '10+0': 'rapid',
  '10+5': 'rapid',
  '15+10': 'rapid',
});
export function poolForPreset(presetId: string): Pool | null {
  return PRESET_POOLS[presetId] ?? null;
}

export type RatingWindow = { untilSeconds: number; difference: number };
export const DEFAULT_RATING_WINDOWS: readonly RatingWindow[] = Object.freeze([
  { untilSeconds: 15, difference: 100 },
  { untilSeconds: 30, difference: 200 },
  { untilSeconds: 60, difference: 400 },
]);
export function ratingWindow(
  elapsedMs: number,
  windows = DEFAULT_RATING_WINDOWS,
) {
  return (
    windows.find((window) => elapsedMs < window.untilSeconds * 1000)
      ?.difference ?? Infinity
  );
}
export function mutuallyCompatible(
  a: { rating: number; queuedAt: Date },
  b: { rating: number; queuedAt: Date },
  now: Date,
  windows = DEFAULT_RATING_WINDOWS,
) {
  const difference = Math.abs(a.rating - b.rating);
  return (
    difference <= ratingWindow(now.getTime() - a.queuedAt.getTime(), windows) &&
    difference <= ratingWindow(now.getTime() - b.queuedAt.getTime(), windows)
  );
}

export type Score = 0 | 0.5 | 1;
/** Pure, zero-sum Elo calculation; rounding happens once, then the shared delta is constrained. */
export function calculateElo(ratingA: number, ratingB: number, scoreA: Score) {
  if (
    ![ratingA, ratingB].every(
      (value) => Number.isSafeInteger(value) && value >= ELO_V1.ratingFloor,
    ) ||
    ![0, 0.5, 1].includes(scoreA)
  )
    throw new Error('Invalid Elo inputs');
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / ELO_V1.scale));
  const roundedDeltaA = Math.round(ELO_V1.kFactor * (scoreA - expectedA));
  const deltaA =
    Math.max(
      ELO_V1.ratingFloor - ratingA,
      Math.min(ratingB - ELO_V1.ratingFloor, roundedDeltaA),
    ) || 0;
  return {
    expectedA,
    roundedDeltaA: roundedDeltaA || 0,
    deltaA,
    deltaB: -deltaA || 0,
    afterA: ratingA + deltaA,
    afterB: ratingB - deltaA,
  };
}
