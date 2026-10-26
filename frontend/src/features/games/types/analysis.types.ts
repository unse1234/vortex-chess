import type { Color, Square } from "@/features/games/types/game.types";

export type AnalysisPath = { basePly: number; path: string[] };
export type AnalysisPosition = AnalysisPath & {
  fen: string;
  turn: Color;
  checkSquare: Square | null;
  legalMoves: Partial<Record<Square, Square[]>>;
  moves: {
    uci: string;
    san: string;
    fen: string;
    from: Square;
    to: Square;
    ply: number;
  }[];
};
export type PreviewResponse = Omit<AnalysisPosition, "path">;
