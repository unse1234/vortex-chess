import { describe, expect, it } from 'vitest';
import {
  calculateElo,
  ELO_V1,
  mutuallyCompatible,
  poolForPreset,
  ratingWindow,
} from './rating-policy';
import { TIME_CONTROL_PRESETS } from '../rooms/time-controls';
describe('elo-v1', () => {
  it('uses the fixed published policy', () => {
    expect(ELO_V1).toMatchObject({
      version: 'elo-v1',
      initialRating: 1200,
      kFactor: 32,
      ratingFloor: 100,
      provisionalGames: 10,
    });
  });
  it.each([
    [1200, 1200, 1, 16],
    [1200, 1200, 0, -16],
    [1200, 1200, 0.5, 0],
    [1000, 1400, 0.5, 13],
    [1400, 1000, 0.5, -13],
    [1200, 1600, 1, 29],
    [100, 100, 0, 0],
    [100, 101, 0, 0],
    [101, 100, 0, -1],
    [101, 100, 1, 0],
  ] as const)(
    'calculates %s versus %s with score %s as shared delta %s',
    (a, b, score, delta) => {
      expect(calculateElo(a, b, score)).toMatchObject({
        deltaA: delta,
        deltaB: -delta || 0,
        afterA: a + delta,
        afterB: b - delta,
      });
    },
  );
  it('rounds once (including JS negative half rounding), then negates', () => {
    expect(calculateElo(1200, 1200, 1).expectedA).toBe(0.5);
    for (let a = 100; a <= 1800; a += 7)
      for (const b of [100, 101, 1200, 1800])
        for (const score of [0, 0.5, 1] as const) {
          const result = calculateElo(a, b, score);
          expect(result.afterA + result.afterB).toBe(a + b);
          expect(result.deltaB).toBe(-result.deltaA || 0);
          expect(Math.min(result.afterA, result.afterB)).toBeGreaterThanOrEqual(
            100,
          );
          expect(result.roundedDeltaA).toBe(
            Math.round(32 * (score - 1 / (1 + 10 ** ((b - a) / 400)))) || 0,
          );
        }
  });
  it('rejects invalid calculation inputs', () => {
    for (const a of [99, NaN, Infinity, 1200.1])
      expect(() => calculateElo(a, 1200, 1)).toThrow();
  });
  it('maps exact supported presets, leaving classical and unknown controls casual', () => {
    for (const preset of TIME_CONTROL_PRESETS)
      expect(poolForPreset(preset.id)).toBe(
        preset.category === 'classical' ? null : preset.category,
      );
    expect(poolForPreset('custom')).toBeNull();
  });
});
describe('mutual matchmaking rating windows', () => {
  it.each([
    [0, 100],
    [14999, 100],
    [15000, 200],
    [29999, 200],
    [30000, 400],
    [59999, 400],
    [60000, Infinity],
  ])('%s ms allows %s', (elapsed, difference) => {
    expect(ratingWindow(elapsed)).toBe(difference);
  });
  it('requires both windows; an older search cannot pull a new player outside their band', () => {
    const now = new Date(100000);
    const old = { rating: 1200, queuedAt: new Date(0) };
    expect(
      mutuallyCompatible(old, { rating: 1700, queuedAt: new Date(99999) }, now),
    ).toBe(false);
    expect(
      mutuallyCompatible(old, { rating: 1700, queuedAt: new Date(0) }, now),
    ).toBe(true);
    expect(mutuallyCompatible(old, { rating: 1300, queuedAt: now }, now)).toBe(
      true,
    );
  });
  it('accepts centrally configured widening windows', () => {
    expect(ratingWindow(5000, [{ untilSeconds: 10, difference: 50 }])).toBe(50);
    expect(ratingWindow(10000, [{ untilSeconds: 10, difference: 50 }])).toBe(
      Infinity,
    );
  });
});
