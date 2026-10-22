import type { TimeControl } from "@/types/time-control.types";
import type { UserSummary } from "@/types/user-summary.types";

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";

type SquareFile = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
type SquareRank = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type Square = `${SquareFile}${SquareRank}`;

export type GameParticipant = UserSummary & {
  rating: number;
} & (
    | { kind: "human"; /** Leaderboard position, when the backend supplies one. */ rank: number | null }
    | { kind: "bot"; /** Difficulty label, e.g. "LV.MAX". */ level: string }
  );

export type GameOutcome = "white" | "black" | "draw";

export type GameResult = {
  outcome: GameOutcome;
  reason: "checkmate" | "resignation" | "timeout" | "agreement" | "stalemate" | "abandonment";
  /** Rating change per colour, once the backend has calculated it. */
  ratingChange: { w: number; b: number } | null;
};

/**
 * One representation of "what is happening": the game is either in progress
 * with exactly one side to move, or finished. Derived views (my turn, bot
 * thinking) are computed from this and the participants, never stored.
 */
export type GameStatus =
  | { phase: "in-progress"; turn: Color }
  | { phase: "finished"; result: GameResult };

/** Clock readings as of `serverTime`; the running side's time keeps falling after it. */
export type GameClocks = {
  remainingMs: Record<Color, number>;
  runningSide: Color | null;
  /** Server clock (ms since epoch) when these readings were taken. */
  serverTime: number;
};

export type MoveAnnotation = "best" | "book" | "inaccuracy";

export type GameMove = {
  /** 1-based half-move number: 1 is White's first move, 2 is Black's reply. */
  ply: number;
  san: string;
  from: Square;
  to: Square;
  annotation: MoveAnnotation | null;
};

export type DrawOffer = {
  by: Color;
  state: "pending" | "declined";
};

export type ViewerPermissions =
  | {
      role: "player";
      color: Color;
      canMove: boolean;
      canResign: boolean;
      canOfferDraw: boolean;
      canRespondToDraw: boolean;
    }
  | {
      role: "spectator";
      color: null;
      canMove: false;
      canResign: false;
      canOfferDraw: false;
      canRespondToDraw: false;
    };

export type GameAnalysis = {
  engine: string;
  depth: number;
  /** Engine evaluation from White's point of view; exactly one of the two is set. */
  evaluation: { centipawns: number; mateIn: null } | { centipawns: null; mateIn: number };
  /** White's win probability, 0–100. */
  whiteWinProbability: number;
  /** Positive when White is ahead on material, in pawns. */
  materialBalance: number;
  opening: { name: string; variation: string | null; eco: string } | null;
  /** The viewer's accuracy so far, 0–100, when the engine has scored it. */
  accuracy: number | null;
};

/**
 * Whether the viewer may see engine analysis is decided by the backend (for
 * example, live assistance is withheld in ranked human games).
 */
export type GameAnalysisState =
  | { availability: "available"; data: GameAnalysis }
  | { availability: "restricted"; reason: string }
  | { availability: "unavailable" };

export type GameSnapshot = {
  id: string;
  /** Increases with every authoritative change; used to ignore stale payloads. */
  revision: number;
  rated: boolean;
  timeControl: TimeControl;
  region: string;
  spectatorCount: number;
  fen: string;
  status: GameStatus;
  players: Record<Color, GameParticipant>;
  clocks: GameClocks;
  moves: GameMove[];
  lastMove: { from: Square; to: Square } | null;
  /** Square of the king in check, if any. */
  checkSquare: Square | null;
  /** Pieces captured BY each colour. */
  captured: Record<Color, PieceType[]>;
  viewer: ViewerPermissions;
  /** Legal destinations for the viewer's pieces; empty unless the viewer can move. */
  legalMoves: Partial<Record<Square, Square[]>>;
  drawOffer: DrawOffer | null;
  analysis: GameAnalysisState;
};
