"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  getOccupiedSquares,
  isPromotionMove,
  parseCoordinateMove,
  previewMove,
} from "@/features/games/board-position";
import {
  BoardStatus,
  describeBoardStatus,
} from "@/features/games/components/board/board-status";
import {
  ChessboardAdapter,
  type BoardHighlight,
} from "@/features/games/components/board/chessboard-adapter";
import { PromotionDialog } from "@/features/games/components/board/promotion-dialog";
import { pendingMoveOf } from "@/features/games/hooks/use-game-commands";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { PromotionPiece, Square } from "@/features/games/types/game.types";

/**
 * The board with its interaction rules: pick up or tap a piece, see where it
 * may go (destinations supplied by the server), and send the move. A sent
 * move is shown provisionally, outlined in amber, until the server accepts it
 * or refuses it; the accepted position always comes from the server.
 */
export function GameBoard({ boardSize }: { /** Board edge in CSS pixels, from the arena layout; null until measured. */ boardSize: number | null }) {
  const { game, orientation, commands, connection, connectionAllowsCommands, reviewPly } = useGameSession();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const entryId = useId();

  // Selections belong to one revision: any new revision clears them.
  const [selection, setSelection] = useState<{ revision: number; square: Square } | null>(null);
  const [promotion, setPromotion] = useState<{ revision: number; from: Square; to: Square } | null>(null);
  const [entryMessage, setEntryMessage] = useState("");

  const pendingMove = pendingMoveOf(commands);
  const reviewing = reviewPly !== null;
  const viewerColor = game.viewer.color;
  const canInteract =
    game.viewer.canMove &&
    game.status.phase === "in-progress" &&
    game.status.turn === viewerColor &&
    connectionAllowsCommands &&
    commands.pending === null &&
    !reviewing;

  const selected = selection?.revision === game.revision ? selection.square : null;
  const pendingPromotion = promotion?.revision === game.revision ? promotion : null;
  const occupied = useMemo(() => getOccupiedSquares(game.fen), [game.fen]);

  // What the board shows: an earlier position under review, a provisional
  // move awaiting its answer, or the accepted live position.
  const reviewedMove = reviewing && reviewPly > 0 ? game.moves[reviewPly - 1] : null;
  const displayedFen = reviewing
    ? (reviewedMove?.fen ?? game.initialFen)
    : pendingMove
      ? previewMove(game.fen, pendingMove.from, pendingMove.to, pendingMove.promotion)
      : game.fen;

  // Animate single live moves only. Jumping in or out of review moves many
  // pieces at once, and while they slide a tap lands on whichever piece is
  // passing (react-chessboard attributes it to that piece's destination).
  const viewKey = reviewing ? `review:${reviewPly}` : "live";
  const [view, setView] = useState<{ key: string; jumpFen: string | null }>({ key: viewKey, jumpFen: null });
  if (view.key !== viewKey) setView({ key: viewKey, jumpFen: displayedFen });
  const jumped = view.key !== viewKey || view.jumpFen === displayedFen;

  const highlights = useMemo(() => {
    const result: Partial<Record<Square, BoardHighlight>> = {};
    if (reviewing) {
      if (reviewedMove) {
        result[reviewedMove.from] = "last-move";
        result[reviewedMove.to] = "last-move";
      }
      return result;
    }
    if (game.lastMove) {
      result[game.lastMove.from] = "last-move";
      result[game.lastMove.to] = "last-move";
    }
    if (game.checkSquare) result[game.checkSquare] = "check";
    if (selected) {
      for (const target of game.legalMoves[selected] ?? []) {
        result[target] = occupied.has(target) ? "capture-target" : "move-target";
      }
      result[selected] = "selected";
    }
    if (pendingMove) {
      result[pendingMove.from] = "pending";
      result[pendingMove.to] = "pending";
    }
    return result;
  }, [reviewing, reviewedMove, game.lastMove, game.checkSquare, game.legalMoves, occupied, selected, pendingMove]);

  function sendMove(from: Square, to: Square, promotionPiece?: PromotionPiece) {
    setSelection(null);
    setPromotion(null);
    return commands.move(from, to, promotionPiece);
  }

  /** Returns true when the move was sent, so a dropped piece stays put. */
  function requestMove(from: Square, to: Square): boolean {
    if (!canInteract) return false;
    // Destinations come from the server; anything else snaps back without a round trip.
    if (!game.legalMoves[from]?.includes(to)) return false;
    if (isPromotionMove(game.fen, from, to)) {
      setPromotion({ revision: game.revision, from, to });
      return false;
    }
    return sendMove(from, to);
  }

  function selectSquare(square: Square) {
    if (!canInteract) return;
    if (selected && game.legalMoves[selected]?.includes(square)) {
      requestMove(selected, square);
      return;
    }
    const hasMoves = Boolean(game.legalMoves[square]?.length);
    setSelection(hasMoves && square !== selected ? { revision: game.revision, square } : null);
  }

  function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem("move") as HTMLInputElement;
    const parsed = parseCoordinateMove(field.value);
    if (!canInteract) {
      setEntryMessage(reviewing ? "Return to the live position to move." : "You can't move right now.");
    } else if (!parsed || !game.legalMoves[parsed.from]?.includes(parsed.to)) {
      setEntryMessage("That move isn't available. Use coordinates such as e2e4.");
    } else if (isPromotionMove(game.fen, parsed.from, parsed.to) && !parsed.promotion) {
      setEntryMessage("Add the promotion piece, for example e7e8q.");
    } else {
      setEntryMessage("");
      field.value = "";
      sendMove(parsed.from, parsed.to, parsed.promotion);
    }
  }

  const status = describeBoardStatus(game, connection, commands.pending, reviewPly);

  return (
    <div className="@container w-full rounded-[10px] bg-[#0a0e19] p-[6px] shadow-[0_0_0_1px_rgb(21_32_38/0.9)]">
      <div
        role="group"
        aria-label="Chess board"
        aria-busy={commands.pending !== null}
        // The library fills its container's width with square cells; this sets the edge.
        className="mx-auto aspect-square w-full max-w-[560px]"
        style={boardSize !== null ? { width: boardSize, maxWidth: "none" } : undefined}
      >
        <ChessboardAdapter
          fen={displayedFen}
          orientation={orientation}
          highlights={highlights}
          interactive={canInteract}
          canDragFrom={(square) => Boolean(game.legalMoves[square]?.length)}
          onSquareSelect={selectSquare}
          onMoveRequest={requestMove}
          animate={!reducedMotion && !jumped}
        />
      </div>

      <BoardStatus {...status} />

      {game.viewer.canMove ? (
        <form
          onSubmit={submitEntry}
          className="sr-only focus-within:not-sr-only focus-within:mt-3 focus-within:flex focus-within:items-center focus-within:gap-2"
        >
          <label htmlFor={entryId} className="font-body text-[13px] text-auth-label">
            Enter a move
          </label>
          <input
            id={entryId}
            name="move"
            autoComplete="off"
            placeholder="e2e4"
            className="h-9 w-28 rounded-[4px] bg-auth-field-alt px-3 font-mono text-[14px] text-auth-text outline-none focus:ring-2 focus:ring-auth-primary/60"
          />
          <button type="submit" className="h-9 rounded-[4px] bg-auth-primary px-3 font-display text-[13px] font-bold text-auth-on-primary">
            Send
          </button>
          <span role="status" className="font-body text-[12.5px] text-auth-danger">
            {entryMessage}
          </span>
        </form>
      ) : null}

      <PromotionDialog
        open={pendingPromotion !== null}
        color={viewerColor}
        onSelect={(piece) => pendingPromotion && sendMove(pendingPromotion.from, pendingPromotion.to, piece)}
        onCancel={() => setPromotion(null)}
      />
    </div>
  );
}
