import type { PromotionPiece, Square } from "@/features/games/types/game.types";

export type MoveCommand = {
  /** Idempotency key: the same request is never applied twice. */
  requestId: string;
  /** The snapshot revision the player was looking at when they moved. */
  expectedRevision: number;
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
};

export type DrawResponse = "accept" | "decline";
