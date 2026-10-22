import type { Color, PieceType } from "@/features/games/types/game.types";

const VALUE: Record<PieceType, number> = { q: 9, r: 5, b: 3, n: 3, p: 1, k: 0 };

/** Pieces a player has captured, most valuable first, drawn in the colour they had on the board. */
export function CapturedPieces({
  pieces,
  capturedColor,
}: {
  pieces: PieceType[];
  /** Colour of the captured pieces (the opponent's colour). */
  capturedColor: Color;
}) {
  if (pieces.length === 0) return null;
  const sorted = [...pieces].sort((a, b) => VALUE[b] - VALUE[a]);

  return (
    <span className="flex items-center" role="img" aria-label={`Captured ${sorted.length} piece${sorted.length === 1 ? "" : "s"}`}>
      {sorted.map((piece, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- tiny decorative SVG sprites
        <img
          key={`${piece}-${index}`}
          src={`/chess/pieces/${capturedColor}${piece.toUpperCase()}.svg`}
          alt=""
          className="-mr-[3px] size-[17px] opacity-90 last:mr-0"
        />
      ))}
    </span>
  );
}
