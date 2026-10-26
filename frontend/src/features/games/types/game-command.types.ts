import type { GameUpdate, PromotionPiece, Square } from "@/features/games/types/game.types";

export type MoveCommand = {
  /** Idempotency key: retrying the same request never applies it twice. */
  requestId: string;
  /** The revision the player was looking at when they moved. */
  expectedRevision: number;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
};

export type DrawResponse = "accept" | "decline";

/** Realtime command names, answered with a GameCommandAck. */
export type GameCommandType = "game.move" | "game.resign" | "game.draw.offer" | "game.draw.respond";

export type GameCommandError = { code: string; message: string; retryable: boolean };

/** The server's answer to a command; `game` is the authoritative state to reconcile. */
export type GameCommandAck =
  | { ok: true; duplicate: boolean; game: GameUpdate }
  | { ok: false; error: GameCommandError; game: GameUpdate | null };

/** A command waiting for its answer. "uncertain" means it may or may not have been applied. */
export type PendingCommand = {
  type: GameCommandType;
  payload: Record<string, unknown> & { requestId: string };
  status: "sending" | "uncertain";
};
