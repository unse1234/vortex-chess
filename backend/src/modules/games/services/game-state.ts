import { Chess } from 'chess.js';
import { createHash } from 'node:crypto';
import type { ClockState } from '../clocks/game-clock';
import {
  positionFacts,
  repetitionKey,
  STANDARD_START_FEN,
  type Color,
  type Outcome,
  type PieceLetter,
  type PositionFacts,
  type PromotionPiece,
} from '../rules/chess-rules';
import { buildPgn } from '../rules/pgn';

/**
 * A seat. Players are accounts; the engine is the engine service, identified
 * by the name it reported at game creation. Engine ids are never account ids,
 * so no account can act for the engine.
 */
export type PlayerInfo =
  | { kind: 'human'; id: string; username: string }
  | { kind: 'engine'; id: string; username: string };

export type GameMode = 'friends' | 'engine';

/** Stable identity of the engine seat in views; account ids are UUIDs, so it never collides. */
export const ENGINE_PLAYER_ID = 'engine';

/** An accepted, persisted move. Never changes once recorded. */
export type MoveRecord = {
  ply: number;
  color: Color;
  /** The player who moved; null for the engine. */
  actorId: string | null;
  requestId: string;
  uci: string;
  san: string;
  from: string;
  to: string;
  promotion: PromotionPiece | null;
  captured: PieceLetter | null;
  fenAfter: string;
  playedAt: number;
  elapsedMs: number;
  /** Both clocks after the move, increment included. */
  remainingMs: Record<Color, number>;
};

export type DrawState = {
  /** Player with a pending draw offer. */
  offerBy: Color | null;
  /** Player whose offer was declined; cleared by the next move. */
  declinedBy: Color | null;
};

/**
 * Committed game state. Each object is immutable: a command builds the next
 * one as a candidate and it replaces the published one only after the
 * database commit succeeds.
 */
export type GameState = {
  id: string;
  roomId: string | null;
  mode: GameMode;
  players: Record<Color, PlayerInfo>;
  initialFen: string;
  initialMs: number;
  incrementMs: number;
  startedAt: number;
  revision: number;
  ply: number;
  fen: string;
  status: 'active' | 'finished';
  /** For a finished game, the final readings (turnStartedAt is then unused). */
  clock: ClockState;
  draw: DrawState;
  outcome: Outcome | null;
  endedAt: number | null;
  pgn: string | null;
  /** Turn, legal moves and check of `fen`, computed once per position. */
  facts: PositionFacts;
};

export type AppliedCommand = { fingerprint: string; revision: number };

/** Warm, server-owned state of one game. */
export type GameRuntime = {
  state: GameState;
  moves: MoveRecord[];
  /** Occurrences of each position identity, for repetition. */
  repetitions: Map<string, number>;
  /** Applied commands by `${actorId}:${requestId}`. */
  commands: Map<string, AppliedCommand>;
  timer?: NodeJS.Timeout;
  lastAccess: number;
};

export const commandKey = (actorId: string, requestId: string) =>
  `${actorId}:${requestId}`;

/**
 * Stable identity of one engine turn, derived from the game and the revision
 * the search was scheduled at, formatted as a UUID (version 8) so it fits the
 * move record's request id. Rescheduling or retrying the same turn yields the
 * same id; the next turn (a new revision) gets a new one.
 */
export function engineTurnRequestId(gameId: string, revision: number) {
  const hex = createHash('sha256').update(`engine-turn:${gameId}:${revision}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The seat an account plays; never the engine's. */
export function colorOf(state: GameState, userId: string): Color | null {
  if (state.players.w.kind === 'human' && state.players.w.id === userId) return 'w';
  if (state.players.b.kind === 'human' && state.players.b.id === userId) return 'b';
  return null;
}

/** The engine's colour in an engine game. */
export function engineColorOf(state: Pick<GameState, 'players'>): Color | null {
  if (state.players.w.kind === 'engine') return 'w';
  if (state.players.b.kind === 'engine') return 'b';
  return null;
}

/** Ends a game: final clocks, result and PGN, no running clock or offers. */
export function finishState(
  state: GameState,
  outcome: Outcome,
  at: number,
  remainingMs: Record<Color, number>,
  sans: readonly string[],
): GameState {
  return {
    ...state,
    status: 'finished',
    outcome,
    endedAt: at,
    clock: { remainingMs, turnStartedAt: at },
    draw: { offerBy: null, declinedBy: null },
    pgn: buildPgn({
      white: state.players.w.username,
      black: state.players.b.username,
      startedAt: new Date(state.startedAt),
      initialMs: state.initialMs,
      incrementMs: state.incrementMs,
      initialFen: state.initialFen,
      standardStart: state.initialFen === STANDARD_START_FEN,
      sans,
      outcome,
    }),
  };
}

export class GameIntegrityError extends Error {
  constructor(gameId: string, detail: string) {
    super(`Game ${gameId} failed reconstruction: ${detail}`);
    this.name = 'GameIntegrityError';
  }
}

/**
 * Rebuilds a game by replaying its complete accepted move history from the
 * initial position, verifying every stored resulting position. The latest FEN
 * alone would lose the repetition history.
 */
export function reconstruct(
  state: Omit<GameState, 'facts'>,
  moves: readonly MoveRecord[],
  commands: ReadonlyMap<string, AppliedCommand>,
  now: number,
): GameRuntime {
  const chess = new Chess(state.initialFen);
  const repetitions = new Map<string, number>([
    [repetitionKey(state.initialFen), 1],
  ]);
  moves.forEach((move, index) => {
    if (move.ply !== index + 1)
      throw new GameIntegrityError(state.id, `missing ply ${index + 1}`);
    try {
      chess.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      });
    } catch {
      throw new GameIntegrityError(state.id, `illegal stored move at ply ${move.ply}`);
    }
    if (chess.fen() !== move.fenAfter)
      throw new GameIntegrityError(state.id, `position mismatch at ply ${move.ply}`);
    const key = repetitionKey(move.fenAfter);
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
  });
  if (chess.fen() !== state.fen || moves.length !== state.ply)
    throw new GameIntegrityError(state.id, 'current position differs from history');
  return {
    state: { ...state, facts: positionFacts(state.fen) },
    moves: [...moves],
    repetitions,
    commands: new Map(commands),
    lastAccess: now,
  };
}
