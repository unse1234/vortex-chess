import type { Color, PromotionPiece, Square } from "@/features/games/types/game.types";

/**
 * Read-only helpers over the board placement of a FEN string, for display
 * decisions (is this square occupied, is this move a promotion). They never
 * decide legality; the backend supplies legal moves and validates every move.
 */

const FILES = "abcdefgh";

function parsePlacement(fen: string): Map<Square, string> {
  const pieces = new Map<Square, string>();
  const ranks = fen.split(" ")[0].split("/");
  ranks.forEach((rankText, rankIndex) => {
    let fileIndex = 0;
    for (const char of rankText) {
      if (/\d/.test(char)) {
        fileIndex += Number(char);
      } else {
        pieces.set(`${FILES[fileIndex]}${8 - rankIndex}` as Square, char);
        fileIndex += 1;
      }
    }
  });
  return pieces;
}

/** FEN piece letter on a square ("P" white pawn, "n" black knight), or null. */
export function getPieceAt(fen: string, square: Square): string | null {
  return parsePlacement(fen).get(square) ?? null;
}

export function getOccupiedSquares(fen: string): Set<Square> {
  return new Set(parsePlacement(fen).keys());
}

/** A pawn reaching the far rank has to choose what to promote to. */
export function isPromotionMove(fen: string, from: Square, to: Square): boolean {
  const piece = getPieceAt(fen, from);
  if (piece === "P") return to.endsWith("8");
  if (piece === "p") return to.endsWith("1");
  return false;
}

export function pieceColor(piece: string): Color {
  return piece === piece.toUpperCase() ? "w" : "b";
}

const PROMOTION_LETTERS: readonly PromotionPiece[] = ["q", "r", "b", "n"];

/** Parses coordinate notation such as "e2e4" or "e7e8q". */
export function parseCoordinateMove(
  input: string,
): { from: Square; to: Square; promotion?: PromotionPiece } | null {
  const match = /^([a-h][1-8])\s*-?\s*([a-h][1-8])([qrbn])?$/i.exec(input.trim());
  if (!match) return null;
  const promotion = match[3]?.toLowerCase() as PromotionPiece | undefined;
  if (promotion && !PROMOTION_LETTERS.includes(promotion)) return null;
  return {
    from: match[1].toLowerCase() as Square,
    to: match[2].toLowerCase() as Square,
    promotion,
  };
}
