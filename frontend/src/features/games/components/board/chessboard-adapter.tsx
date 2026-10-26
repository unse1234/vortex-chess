"use client";

import { useEffect, useId, useMemo, useRef, type CSSProperties } from "react";
import { Chessboard, defaultPieces } from "react-chessboard";
import type { PromotionPiece, Square } from "@/features/games/types/game.types";
import { getPieceAt, pieceColor } from "@/features/games/board-position";

/**
 * The only module that knows about `react-chessboard`. The rest of the app
 * talks to this small contract, so upgrading or replacing the library stays
 * contained here.
 */

export type BoardHighlight =
  | "last-move"
  | "selected"
  | "move-target"
  | "capture-target"
  | "check"
  | "pending";

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
  /**
   * The player dropped a dragged piece on another square. Returns true when
   * the move was taken (the piece stays where it was dropped until the
   * accepted position arrives), false to send it back.
   */
  onMoveRequest: (from: Square, to: Square) => boolean;
  /** Animate piece movement. */
  animate: boolean;
  /** Display-only dropped piece while a server preview is pending. FEN stays validated. */
  pendingDrop?: { from: Square; to: Square; promotion?: PromotionPiece } | null;
};

/**
 * Highlights are layered over the library's default square colours rather
 * than replacing them, so light and dark squares stay recognisable.
 */
const tint = (color: string) => `linear-gradient(${color}, ${color})`;
const DOT =
  "radial-gradient(circle, rgb(20 85 30 / 0.5) 0 16%, transparent 18%)";
const RING =
  "radial-gradient(circle, transparent 0 62%, rgb(20 85 30 / 0.5) 64% 78%, transparent 80%)";

const highlightStyles: Record<BoardHighlight, CSSProperties> = {
  "last-move": { backgroundImage: tint("rgb(205 210 106 / 0.55)") },
  selected: { backgroundImage: tint("rgb(20 85 30 / 0.45)") },
  "move-target": { backgroundImage: DOT },
  "capture-target": { backgroundImage: RING },
  check: {
    backgroundImage:
      "radial-gradient(circle, rgb(255 0 0 / 0.75) 0 25%, rgb(231 0 0 / 0.35) 55%, transparent 80%)",
  },
  pending: { backgroundImage: tint("rgb(255 170 0 / 0.45)") },
};

/** Library defaults throughout: pieces, square colours, notation and dragging. */
const baseOptions = {
  allowDrawingArrows: false,
  allowDragOffBoard: false,
} satisfies Parameters<typeof Chessboard>[0]["options"];

export type PieceCode = `${"w" | "b"}${"P" | "N" | "B" | "R" | "Q" | "K"}`;

/** One piece in the board's own artwork, for the promotion choices. */
export function BoardPiece({ code }: { code: PieceCode }) {
  const Piece = defaultPieces[code];
  return <Piece />;
}

export function ChessboardAdapter({
  fen,
  orientation,
  highlights,
  interactive,
  canDragFrom,
  onSquareSelect,
  onMoveRequest,
  animate,
  pendingDrop,
}: ChessboardAdapterProps) {
  const boardId = useId();
  // The library keeps the drop handler from when the drag began; always call the latest one.
  const moveRequest = useRef(onMoveRequest);
  useEffect(() => {
    moveRequest.current = onMoveRequest;
  }, [onMoveRequest]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    for (const [square, kind] of Object.entries(highlights)) {
      styles[square] = { ...styles[square], ...highlightStyles[kind] };
    }
    return styles;
  }, [highlights]);
  const pendingPiece = pendingDrop ? getPieceAt(fen, pendingDrop.from) : null;
  const pendingCode = pendingPiece
    ? (`${pieceColor(pendingPiece)}${(pendingDrop?.promotion ?? pendingPiece).toUpperCase()}` as PieceCode)
    : null;

  return (
    <Chessboard
      options={{
        ...baseOptions,
        id: boardId,
        position: fen,
        boardOrientation: orientation,
        squareStyles,
        allowDragging: interactive,
        showAnimations: animate,
        animationDurationInMs: 180,
        // Keep drag feedback at the drop square without advancing chess state.
        // Other pieces (including a castling rook or en-passant capture) stay
        // exactly as recorded until the backend supplies the next position.
        squareRenderer:
          pendingDrop && pendingCode
            ? ({ square, children }) => {
                return (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      ...squareStyles[square],
                      visibility:
                        square === pendingDrop.from ? "hidden" : undefined,
                    }}
                  >
                    {square !== pendingDrop.to ? (
                      children
                    ) : (
                      <div
                        aria-hidden
                        data-piece={pendingCode}
                        data-pending-drop="true"
                        style={{ width: "100%", height: "100%", opacity: 0.75 }}
                      >
                        <BoardPiece code={pendingCode} />
                      </div>
                    )}
                  </div>
                );
              }
            : undefined,
        canDragPiece: ({ square }) =>
          interactive && square !== null && canDragFrom(square as Square),
        onSquareClick: ({ square }) => onSquareSelect(square as Square),
        onPieceDrop: ({ sourceSquare, targetSquare }) =>
          Boolean(
            targetSquare &&
            targetSquare !== sourceSquare &&
            moveRequest.current(sourceSquare as Square, targetSquare as Square),
          ),
      }}
    />
  );
}
