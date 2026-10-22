import type { GameResult, ViewerPermissions } from "@/features/games/types/game.types";

const REASONS: Record<GameResult["reason"], string> = {
  checkmate: "by checkmate",
  resignation: "by resignation",
  timeout: "on time",
  agreement: "by agreement",
  stalemate: "by stalemate",
  abandonment: "by abandonment",
};

export type ResultSummary = {
  headline: string;
  detail: string;
  tone: "win" | "loss" | "neutral";
  /** Rating change for the viewer, when they played and it's been calculated. */
  ratingChange: number | null;
};

/** Result wording from the viewer's point of view ("Victory" / "Defeat" for players). */
export function summarizeResult(result: GameResult, viewer: ViewerPermissions): ResultSummary {
  const reason = REASONS[result.reason];
  const winnerName = result.outcome === "white" ? "White" : "Black";

  if (result.outcome === "draw") {
    return {
      headline: "Draw",
      detail: `The game ended in a draw ${reason}.`,
      tone: "neutral",
      ratingChange: viewer.color ? (result.ratingChange?.[viewer.color] ?? null) : null,
    };
  }

  if (viewer.role === "spectator") {
    return { headline: `${winnerName} wins`, detail: `${winnerName} won ${reason}.`, tone: "neutral", ratingChange: null };
  }

  const won = (result.outcome === "white") === (viewer.color === "w");
  return {
    headline: won ? "Victory" : "Defeat",
    detail: won ? `You won ${reason}.` : `${winnerName} won ${reason}.`,
    tone: won ? "win" : "loss",
    ratingChange: result.ratingChange?.[viewer.color] ?? null,
  };
}
