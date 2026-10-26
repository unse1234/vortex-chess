import type { Color, PieceType, PromotionPiece, Square } from "@/features/games/types/game.types";

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

function placementOf(pieces: Map<Square, string>): string {
  const ranks: string[] = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let text = "";
    let empty = 0;
    for (const file of FILES) {
      const piece = pieces.get(`${file}${rank}` as Square);
      if (piece) {
        text += `${empty || ""}${piece}`;
        empty = 0;
      } else empty += 1;
    }
    ranks.push(text + (empty || ""));
  }
  return ranks.join("/");
}

/**
 * Provisional placement while a move awaits the server's answer, so a dropped
 * piece stays where the player put it. Display only: the rest of the FEN is
 * kept as is, and the accepted position replaces it on acknowledgement (or the
 * piece returns if the move is refused).
 */
export function previewMove(fen: string, from: Square, to: Square, promotion?: PromotionPiece): string {
  const pieces = parsePlacement(fen);
  const piece = pieces.get(from);
  if (!piece) return fen;
  const pawn = piece.toLowerCase() === "p";
  // A pawn moving diagonally onto an empty square captures en passant.
  if (pawn && from[0] !== to[0] && !pieces.has(to)) pieces.delete(`${to[0]}${from[1]}` as Square);
  // A king moving two files castles; its rook jumps over it.
  if (piece.toLowerCase() === "k" && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) {
    const kingside = to[0] === "g";
    const rookFrom = `${kingside ? "h" : "a"}${from[1]}` as Square;
    const rook = pieces.get(rookFrom);
    if (rook) {
      pieces.delete(rookFrom);
      pieces.set(`${kingside ? "f" : "d"}${from[1]}` as Square, rook);
    }
  }
  pieces.delete(from);
  const placed = pawn && promotion ? (pieceColor(piece) === "w" ? promotion.toUpperCase() : promotion) : piece;
  pieces.set(to, placed);
  return [placementOf(pieces), ...fen.split(" ").slice(1)].join(" ");
}

/** Pieces captured BY each colour, from the server's move records. */
export function capturedByColor(moves: readonly { color: Color; captured: PieceType | null }[]) {
  const captured: Record<Color, PieceType[]> = { w: [], b: [] };
  for (const move of moves) if (move.captured) captured[move.color].push(move.captured);
  return captured;
}
