import { afterMove, deadlineOf, hasFlagFallen, readingAt, type ClockState } from './game-clock';

const clock: ClockState = { remainingMs: { w: 60_000, b: 45_000 }, turnStartedAt: 1_000_000 };

describe('Official clock', () => {
  it('charges only the side to move, from the server time its turn started', () => {
    expect(readingAt(clock, 'w', 1_010_000)).toEqual({ w: 50_000, b: 45_000 });
    expect(readingAt(clock, 'b', 1_010_000)).toEqual({ w: 60_000, b: 35_000 });
    expect(readingAt(clock, null, 1_010_000)).toEqual({ w: 60_000, b: 45_000 });
    // A command observed "before" the turn began (it cannot be) is charged nothing.
    expect(readingAt(clock, 'w', 999_000)).toEqual({ w: 60_000, b: 45_000 });
  });

  it('applies the increment exactly once per accepted move and starts the opponent at receipt', () => {
    const { elapsedMs, clock: next } = afterMove(clock, 'w', 1_012_500, 2_000);
    expect(elapsedMs).toBe(12_500);
    expect(next).toEqual({ remainingMs: { w: 49_500, b: 45_000 }, turnStartedAt: 1_012_500 });
    const reply = afterMove(next, 'b', 1_020_000, 2_000).clock;
    expect(reply.remainingMs).toEqual({ w: 49_500, b: 39_500 });
  });

  it('flags at the deadline exactly, not a millisecond before', () => {
    expect(deadlineOf(clock, 'w')).toBe(1_060_000);
    expect(hasFlagFallen(clock, 'w', 1_059_999)).toBe(false);
    expect(hasFlagFallen(clock, 'w', 1_060_000)).toBe(true);
    expect(hasFlagFallen(clock, 'b', 1_044_999)).toBe(false);
  });
});
