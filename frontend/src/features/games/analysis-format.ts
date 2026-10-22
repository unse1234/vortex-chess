import type { GameAnalysis } from "@/features/games/types/game.types";

/** Signed evaluation in pawns from White's view: "+1.24", "-0.30", or "M3" for a forced mate. */
export function formatEvaluation(evaluation: GameAnalysis["evaluation"]): string {
  if (evaluation.mateIn !== null) {
    return `${evaluation.mateIn < 0 ? "-" : ""}M${Math.abs(evaluation.mateIn)}`;
  }
  const pawns = evaluation.centipawns / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** "Material Even", "+1 Pawn Advantage", "-3 Material Advantage" (negative favours Black). */
export function describeMaterial(balance: number): string {
  if (balance === 0) return "Material Even";
  const size = Math.abs(balance);
  const sign = balance > 0 ? "+" : "-";
  return size < 3
    ? `${sign}${size} ${size === 1 ? "Pawn" : "Pawns"} Advantage`
    : `${sign}${size} Material Advantage`;
}

/** Which side the evaluation favours, for the win-probability caption. */
export function describeWinProbability(whiteWinProbability: number): string {
  const white = Math.round(whiteWinProbability);
  return white >= 50 ? `${white}% WHITE` : `${100 - white}% BLACK`;
}
