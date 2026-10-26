import { readingAt } from './clocks/game-clock';
import { opposite, type Color, type Termination } from './rules/chess-rules';
import { colorOf, type GameRuntime, type GameState, type MoveRecord } from './services/game-state';
import { timeControlOf, type TimeControl } from '../rooms/time-controls';
import type { PlayerProfile } from '../users/users.service';

export type GameStatusView =
  | { phase: 'in-progress'; turn: Color }
  | {
      phase: 'finished';
      result: { outcome: 'white' | 'black' | 'draw'; reason: Termination };
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

export type GamePlayerView = PlayerProfile & { kind: 'human'; online: boolean };

/** Complete authorized state: the initial load and every resynchronization. */
export type GameSnapshotView = Omit<GameLiveView, 'move'> & {
  roomId: string | null;
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
      outcome: winner === 'w' ? 'white' : winner === 'b' ? 'black' : 'draw',
      reason: termination,
    },
  };
}

function viewerView(state: GameState, color: Color): GameViewerView {
  const active = state.status === 'active';
  const { offerBy, declinedBy } = state.draw;
  return {
    role: 'player',
    color,
    canMove: active && state.facts.turn === color,
    canResign: active,
    // After a declined offer, the same player may offer again once they have moved.
    canOfferDraw: active && offerBy === null && declinedBy !== color,
    canRespondToDraw: active && offerBy === opposite(color),
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
): GameSnapshotView | null {
  const { state, moves } = runtime;
  const live = toLiveView(state, viewerId, now, moves.at(-1));
  if (!live) return null;
  const { move: _omit, ...rest } = live;
  const player = (color: Color): GamePlayerView => ({
    id: state.players[color].id,
    username: state.players[color].username,
    avatarUrl: null,
    kind: 'human',
    online: isOnline(state.players[color].id),
  });
  return {
    ...rest,
    roomId: state.roomId,
    timeControl: timeControlOf(state),
    initialFen: state.initialFen,
    players: { w: player('w'), b: player('b') },
    moves: moves.map((move) => toMoveView(move, viewerId)),
    startedAt: new Date(state.startedAt).toISOString(),
    pgn: state.pgn,
  };
}
