"use client";

import { useMemo, type CSSProperties } from "react";
import { Chessboard, defaultBoardStyle, type PieceRenderObject } from "react-chessboard";
import type { Square } from "@/features/games/types/game.types";

/**
 * The only module that knows about `react-chessboard`. The rest of the app
 * talks to this small contract, so upgrading or replacing the library stays
 * contained here.
 */

export type BoardHighlight = "last-move" | "selected" | "move-target" | "capture-target" | "check" | "pending";

export type ChessboardAdapterProps = {
  fen: string;
  orientation: "white" | "black";
  highlights: Partial<Record<Square, BoardHighlight>>;
  /** Whether the board accepts any input right now. */
  interactive: boolean;
  /** Whether the piece on this square may be picked up. */
  canDragFrom: (square: Square) => boolean;
  /** The player tapped or clicked a square. */
  onSquareSelect: (square: Square) => void;
  /** The player dropped a dragged piece on another square. */
  onMoveRequest: (from: Square, to: Square) => void;
  /** Animate piece movement. */
  animate: boolean;
};

const PIECE_CODES = ["wP", "wR", "wN", "wB", "wQ", "wK", "bP", "bR", "bN", "bB", "bQ", "bK"] as const;

const pieces: PieceRenderObject = Object.fromEntries(
  PIECE_CODES.map((code) => [
    code,
    () => (
      <span style={{ display: "flex", width: "100%", aspectRatio: "1 / 1", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG sprites drawn inside the board library */}
        <img
          src={`/chess/pieces/${code}.svg`}
          alt=""
          draggable={false}
          style={{ width: "44%", aspectRatio: "1 / 1", pointerEvents: "none", userSelect: "none" }}
        />
      </span>
    ),
  ]),
);

const DOT = "radial-gradient(circle, rgb(78 222 163 / 0.5) 0 17%, transparent 19%)";
const RING = "radial-gradient(circle, transparent 0 60%, rgb(78 222 163 / 0.55) 62% 74%, transparent 76%)";

const highlightStyles: Record<BoardHighlight, CSSProperties> = {
  "last-move": { backgroundColor: "#1f4d42" },
  selected: { backgroundColor: "#1f4d42", boxShadow: "inset 0 0 0 3px #4edea3" },
  "move-target": { backgroundImage: DOT },
  "capture-target": { backgroundImage: RING },
  check: { backgroundImage: "radial-gradient(circle, rgb(255 107 107 / 0.55) 0 45%, transparent 75%)" },
  pending: { boxShadow: "inset 0 0 0 3px #ffb95f" },
};

const baseOptions = {
  id: "vortex-board",
  pieces,
  boardStyle: { ...defaultBoardStyle(8), borderRadius: 8 },
  darkSquareStyle: { backgroundColor: "#252a35" },
  lightSquareStyle: { backgroundColor: "#1b202a" },
  dropSquareStyle: { boxShadow: "inset 0 0 0 3px rgb(78 222 163 / 0.7)" },
  draggingPieceStyle: { transform: "scale(1.12)" },
  lightSquareNotationStyle: { color: "#5d6768" },
  darkSquareNotationStyle: { color: "#5d6768" },
  alphaNotationStyle: { fontSize: "11px", position: "absolute", bottom: 3, right: 7, userSelect: "none" },
  numericNotationStyle: { fontSize: "11px", position: "absolute", top: 4, left: 6, userSelect: "none" },
  allowDrawingArrows: false,
  allowDragOffBoard: false,
} satisfies Parameters<typeof Chessboard>[0]["options"];

export function ChessboardAdapter({
  fen,
  orientation,
  highlights,
  interactive,
  canDragFrom,
  onSquareSelect,
  onMoveRequest,
  animate,
}: ChessboardAdapterProps) {
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    for (const [square, kind] of Object.entries(highlights)) {
      styles[square] = { ...styles[square], ...highlightStyles[kind] };
    }
    return styles;
  }, [highlights]);

  return (
    <Chessboard
      options={{
        ...baseOptions,
        position: fen,
        boardOrientation: orientation,
        squareStyles,
        allowDragging: interactive,
        showAnimations: animate,
        animationDurationInMs: 180,
        canDragPiece: ({ square }) => interactive && square !== null && canDragFrom(square as Square),
        onSquareClick: ({ square }) => onSquareSelect(square as Square),
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (targetSquare && targetSquare !== sourceSquare) {
            onMoveRequest(sourceSquare as Square, targetSquare as Square);
          }
          // The piece always returns: only the server's snapshot moves pieces.
          return false;
        },
      }}
    />
  );
}
