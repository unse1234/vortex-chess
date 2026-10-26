import type { Color } from '../rules/chess-rules';

/**
 * Official clock arithmetic. Only the side to move is charged, measured from
 * the server time its turn started to the server time a command was received.
 * Browser timestamps never enter these calculations.
 */
export type ClockState = {
  remainingMs: Record<Color, number>;
  /** Server time (epoch ms) the side to move started thinking. */
  turnStartedAt: number;
};

export function elapsedOnTurn(clock: ClockState, at: number) {
  return Math.max(0, at - clock.turnStartedAt);
}

/** When the side to move runs out of time. */
export function deadlineOf(clock: ClockState, turn: Color) {
  return clock.turnStartedAt + clock.remainingMs[turn];
}

/** Time is up when nothing remains at the instant the server observes it. */
export function hasFlagFallen(clock: ClockState, turn: Color, at: number) {
  return elapsedOnTurn(clock, at) >= clock.remainingMs[turn];
}

/** Readings at `at`, with the running side's elapsed time deducted. */
export function readingAt(clock: ClockState, turn: Color | null, at: number) {
  if (!turn) return { ...clock.remainingMs };
  return {
    ...clock.remainingMs,
    [turn]: Math.max(0, clock.remainingMs[turn] - elapsedOnTurn(clock, at)),
  } as Record<Color, number>;
}

/**
 * Clock after an accepted move received at `receivedAt`: the mover pays the
 * elapsed time, then gains the increment exactly once; the opponent's clock
 * starts at the same instant.
 */
export function afterMove(
  clock: ClockState,
  mover: Color,
  receivedAt: number,
  incrementMs: number,
) {
  const elapsedMs = elapsedOnTurn(clock, receivedAt);
  return {
    elapsedMs,
    clock: {
      remainingMs: {
        ...clock.remainingMs,
        [mover]: clock.remainingMs[mover] - elapsedMs + incrementMs,
      } as Record<Color, number>,
      turnStartedAt: receivedAt,
    },
  };
}
