import type { TimeControl } from "@/types/time-control.types";
import type { UserSummary } from "@/types/user-summary.types";

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";

type SquareFile = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
type SquareRank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type Square = `${SquareFile}${SquareRank}`;

export type GameParticipant = UserSummary & {
  /** Engines play in a later milestone; their moves use the same pipeline. */
  kind: "human" | "engine";
  /** At least one connection to the server, in any tab. */
  online: boolean;
};

export type GameOutcome = "white" | "black" | "draw";

export type GameEndReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "timeout-vs-insufficient-material"
  | "stalemate"
  | "insufficient-material"
  | "threefold-repetition"
  | "fifty-move-rule"
  | "agreement";

export type GameResult = { outcome: GameOutcome; reason: GameEndReason };

/**
 * One representation of "what is happening": the game is either in progress
 * with exactly one side to move, or finished. Derived views (my turn) are
 * computed from this and the viewer, never stored.
 */
export type GameStatus =
  | { phase: "in-progress"; turn: Color }
  | { phase: "finished"; result: GameResult };

/** Official readings at `serverTime`; the running side keeps losing time after it. */
export type GameClocks = {
  remainingMs: Record<Color, number>;
  runningSide: Color | null;
  /** Server clock (ms since epoch) when these readings were taken. */
  serverTime: number;
};

/** An accepted move, exactly as the server recorded it. */
export type GameMove = {
  /** 1-based half-move number: 1 is White's first move, 2 is Black's reply. */
  ply: number;
  color: Color;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  promotion: PromotionPiece | null;
  captured: PieceType | null;
  /** Position after the move, used to review earlier positions. */
  fen: string;
  /** Both clocks after the move, increment included. */
  remainingMs: Record<Color, number>;
  elapsedMs: number;
  playedAt: string;
  /** The command's request id; only present on the viewer's own moves. */
  requestId: string | null;
};

export type DrawOffer = {
  by: Color;
  state: "pending" | "declined";
};

/** Actions the server permits this viewer; it enforces them again on every command. */
export type ViewerPermissions = {
  role: "player";
  color: Color;
  canMove: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  canRespondToDraw: boolean;
};

/** The authoritative live state carried by every update. */
export type GameLiveState = {
  id: string;
  /** Increases with every persisted change (moves, offers, results). */
  revision: number;
  /** Accepted half-moves. Separate from the revision. */
  ply: number;
  fen: string;
  status: GameStatus;
  clocks: GameClocks;
  lastMove: { from: Square; to: Square } | null;
  /** Square of the king in check, if any. */
  checkSquare: Square | null;
  drawOffer: DrawOffer | null;
  viewer: ViewerPermissions;
  /** Legal destinations for the viewer's pieces; empty unless the viewer can move. */
  legalMoves: Partial<Record<Square, Square[]>>;
  endedAt: string | null;
};

/** A compact committed change: live state plus the move it accepted, if any. */
export type GameUpdate = GameLiveState & { move: GameMove | null };

/** The complete authorized game: initial load and every resynchronization. */
export type GameSnapshot = GameLiveState & {
  roomId: string | null;
  timeControl: TimeControl;
  initialFen: string;
  players: Record<Color, GameParticipant>;
  moves: GameMove[];
  startedAt: string;
  /** Final PGN once the game is finished. */
  pgn: string | null;
};
