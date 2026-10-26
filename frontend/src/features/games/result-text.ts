import type { GameEndReason, GameResult, ViewerPermissions } from "@/features/games/types/game.types";

const REASONS: Record<GameEndReason, string> = {
  checkmate: "by checkmate",
  resignation: "by resignation",
  timeout: "on time",
  "timeout-vs-insufficient-material": "as time ran out against a lone king",
  stalemate: "by stalemate",
  "insufficient-material": "by insufficient material",
  "threefold-repetition": "by threefold repetition",
  "fifty-move-rule": "by the fifty-move rule",
  agreement: "by agreement",
};

export type ResultSummary = {
  headline: string;
  detail: string;
  tone: "win" | "loss" | "neutral";
};

/** Result wording from the player's point of view ("Victory" / "Defeat"). */
export function summarizeResult(result: GameResult, viewer: ViewerPermissions): ResultSummary {
  const reason = REASONS[result.reason];
  const winnerName = result.outcome === "white" ? "White" : "Black";

  if (result.outcome === "draw") {
    return { headline: "Draw", detail: `The game ended in a draw ${reason}.`, tone: "neutral" };
  }

  const won = (result.outcome === "white") === (viewer.color === "w");
  return {
    headline: won ? "Victory" : "Defeat",
    detail: won ? `You won ${reason}.` : `${winnerName} won ${reason}.`,
    tone: won ? "win" : "loss",
  };
}
