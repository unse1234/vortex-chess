import { readingAt } from './clocks/game-clock';
import { isAborted, opposite, type Color, type Termination } from './rules/chess-rules';
import {
  colorOf,
  type GameMode,
  type GameRuntime,
  type GameState,
  type MoveRecord,
} from './services/game-state';
import { timeControlOf, type TimeControl } from '../rooms/time-controls';
import type { PlayerProfile } from '../users/users.service';

export type GameStatusView =
  | { phase: 'in-progress'; turn: Color }
  | {
      phase: 'finished';
      /** `aborted`: an engine game ended by an engine-service failure, with no result. */
      result: { outcome: 'white' | 'black' | 'draw' | 'aborted'; reason: Termination };
    };

export type MoveView = {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  promotion: string | null;
  captured: string | null;
  /** Position after the move. */
  fen: string;
  /** Both clocks after the move, increment included. */
  remainingMs: Record<Color, number>;
  elapsedMs: number;
  playedAt: string;
  /** The command's request id, shown only to the player who sent it. */
  requestId: string | null;
};

export type GameViewerView = {
  role: 'player';
  color: Color;
  canMove: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  canRespondToDraw: boolean;
};

/**
 * Compact authoritative state after one committed change. It carries the newly
 * accepted move, never the accumulated history.
 */
export type GameLiveView = {
  id: string;
  revision: number;
  ply: number;
  fen: string;
  status: GameStatusView;
  /** Readings at `serverTime`; the running side keeps losing time after it. */
  clocks: {
    remainingMs: Record<Color, number>;
    runningSide: Color | null;
    serverTime: number;
  };
  lastMove: { from: string; to: string } | null;
  checkSquare: string | null;
  drawOffer: { by: Color; state: 'pending' | 'declined' } | null;
  viewer: GameViewerView;
  /** Destinations for the viewer's pieces; empty unless it is their move. */
  legalMoves: Record<string, string[]>;
  endedAt: string | null;
  /** The move this change accepted, if it was a move. */
  move: MoveView | null;
};

export type GamePlayerView = PlayerProfile & { kind: 'human' | 'engine'; online: boolean };

/**
 * The engine's search for the current turn. Not game state: it never changes
 * the revision, and it applies only while `revision` equals the game's.
 */
export type EngineTurnView = {
  revision: number;
  color: Color;
  phase: 'queued' | 'thinking' | 'retrying';
  attempt: number;
  /** Server time this phase began. */
  since: number;
};

/** Complete authorized state: the initial load and every resynchronization. */
export type GameSnapshotView = Omit<GameLiveView, 'move'> & {
  roomId: string | null;
  mode: GameMode;
  engineTurn: EngineTurnView | null;
  timeControl: TimeControl;
  initialFen: string;
  players: Record<Color, GamePlayerView>;
  moves: MoveView[];
  startedAt: string;
  pgn: string | null;
};

export function toMoveView(move: MoveRecord, viewerId: string): MoveView {
  return {
    ply: move.ply,
    color: move.color,
    san: move.san,
    uci: move.uci,
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    captured: move.captured,
    fen: move.fenAfter,
    remainingMs: move.remainingMs,
    elapsedMs: move.elapsedMs,
    playedAt: new Date(move.playedAt).toISOString(),
    requestId: move.actorId === viewerId ? move.requestId : null,
  };
}

function statusView(state: GameState): GameStatusView {
  if (state.status === 'active' || !state.outcome)
    return { phase: 'in-progress', turn: state.facts.turn };
  const { winner, termination } = state.outcome;
  return {
    phase: 'finished',
    result: {
      outcome: isAborted(state.outcome)
        ? 'aborted'
        : winner === 'w'
          ? 'white'
          : winner === 'b'
            ? 'black'
            : 'draw',
      reason: termination,
    },
  };
}

function viewerView(state: GameState, color: Color): GameViewerView {
  const active = state.status === 'active';
  // The engine service cannot answer draw offers, so engine games have none.
  const draws = active && state.mode === 'friends';
  const { offerBy, declinedBy } = state.draw;
  return {
    role: 'player',
    color,
    canMove: active && state.facts.turn === color,
    canResign: active,
    // After a declined offer, the same player may offer again once they have moved.
    canOfferDraw: draws && offerBy === null && declinedBy !== color,
    canRespondToDraw: draws && offerBy === opposite(color),
  };
}

/** Null when the viewer is not one of the game's players. */
export function toLiveView(
  state: GameState,
  viewerId: string,
  now: number,
  lastMove: MoveRecord | undefined,
  newMove: MoveRecord | null = null,
): GameLiveView | null {
  const color = colorOf(state, viewerId);
  if (!color) return null;
  const active = state.status === 'active';
  const runningSide = active ? state.facts.turn : null;
  const viewer = viewerView(state, color);
  const { offerBy, declinedBy } = state.draw;
  return {
    id: state.id,
    revision: state.revision,
    ply: state.ply,
    fen: state.fen,
    status: statusView(state),
    clocks: {
      remainingMs: active
        ? readingAt(state.clock, runningSide, now)
        : { ...state.clock.remainingMs },
      runningSide,
      serverTime: now,
    },
    lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : null,
    checkSquare: state.facts.checkSquare,
    drawOffer: offerBy
      ? { by: offerBy, state: 'pending' }
      : declinedBy
        ? { by: declinedBy, state: 'declined' }
        : null,
    viewer,
    legalMoves: viewer.canMove ? state.facts.legalMoves : {},
    endedAt: state.endedAt === null ? null : new Date(state.endedAt).toISOString(),
    move: newMove ? toMoveView(newMove, viewerId) : null,
  };
}

export function toSnapshotView(
  runtime: GameRuntime,
  viewerId: string,
  now: number,
  isOnline: (userId: string) => boolean,
  engineTurn: EngineTurnView | null = null,
): GameSnapshotView | null {
  const { state, moves } = runtime;
  const live = toLiveView(state, viewerId, now, moves.at(-1));
  if (!live) return null;
  const { move: _omit, ...rest } = live;
  const player = (color: Color): GamePlayerView => {
    const seat = state.players[color];
    return {
      id: seat.id,
      username: seat.username,
      avatarUrl: null,
      kind: seat.kind,
      // The engine is a service, not a connection; its availability shows through engineTurn.
      online: seat.kind === 'engine' || isOnline(seat.id),
    };
  };
  return {
    ...rest,
    roomId: state.roomId,
    mode: state.mode,
    engineTurn: engineTurn && engineTurn.revision === state.revision ? engineTurn : null,
    timeControl: timeControlOf(state),
    initialFen: state.initialFen,
    players: { w: player('w'), b: player('b') },
    moves: moves.map((move) => toMoveView(move, viewerId)),
    startedAt: new Date(state.startedAt).toISOString(),
    pgn: state.pgn,
  };
}
