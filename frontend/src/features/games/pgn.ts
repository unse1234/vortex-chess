import type { GameMove } from "@/features/games/types/game.types";

/** Move pairs for display: one row per full move number. */
export type MoveRow = {
  number: number;
  white: GameMove | null;
  black: GameMove | null;
};

export function toMoveRows(moves: readonly GameMove[]): MoveRow[] {
  const rows: MoveRow[] = [];
  for (const move of moves) {
    const number = Math.ceil(move.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.number !== number) {
      row = { number, white: null, black: null };
      rows.push(row);
    }
    if (move.ply % 2 === 1) row.white = move;
    else row.black = move;
  }
  return rows;
}

/** Movetext in PGN form, e.g. "1. d4 Nf6 2. c4 g6". Notation comes from the server. */
export function formatMovetext(moves: readonly GameMove[]): string {
  return toMoveRows(moves)
    .map((row) => [`${row.number}.`, row.white?.san, row.black?.san].filter(Boolean).join(" "))
    .join(" ");
}
