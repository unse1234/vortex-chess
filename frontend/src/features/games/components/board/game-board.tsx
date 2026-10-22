"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  getOccupiedSquares,
  isPromotionMove,
  parseCoordinateMove,
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
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { PromotionPiece, Square } from "@/features/games/types/game.types";

/**
 * The board with its interaction rules: pick up or tap a piece, see where it
 * may go (hints supplied by the server), and send the move. Nothing moves on
 * screen until the server's snapshot says so.
 */
export function GameBoard() {
  const { game, orientation, commands, connection, connectionAllowsCommands } = useGameSession();
  const move = commands.move;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const entryId = useId();

  // Selections belong to one snapshot: any new revision clears them.
  const [selection, setSelection] = useState<{ revision: number; square: Square } | null>(null);
  const [promotion, setPromotion] = useState<{ revision: number; from: Square; to: Square } | null>(null);
  const [entryMessage, setEntryMessage] = useState("");

  const viewerColor = game.viewer.color;
  const canInteract =
    game.viewer.canMove &&
    game.status.phase === "in-progress" &&
    game.status.turn === viewerColor &&
    connectionAllowsCommands &&
    !move.isPending;

  const selected = selection?.revision === game.revision ? selection.square : null;
  const pendingPromotion = promotion?.revision === game.revision ? promotion : null;
  const occupied = useMemo(() => getOccupiedSquares(game.fen), [game.fen]);

  const highlights = useMemo(() => {
    const result: Partial<Record<Square, BoardHighlight>> = {};
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
    if (move.isPending) {
      result[move.variables.from] = "pending";
      result[move.variables.to] = "pending";
    }
    return result;
  }, [game.lastMove, game.checkSquare, game.legalMoves, occupied, selected, move.isPending, move.variables]);

  function sendMove(from: Square, to: Square, promotionPiece?: PromotionPiece) {
    setSelection(null);
    setPromotion(null);
    move.mutate({
      requestId: crypto.randomUUID(),
      expectedRevision: game.revision,
      from,
      to,
      promotion: promotionPiece,
    });
  }

  function requestMove(from: Square, to: Square) {
    if (!canInteract) return;
    // Drops the server's hints already rule out snap back without a round trip.
    if (!game.legalMoves[from]?.includes(to)) return;
    if (isPromotionMove(game.fen, from, to)) {
      setPromotion({ revision: game.revision, from, to });
      return;
    }
    sendMove(from, to);
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
      setEntryMessage("It isn't your turn to move.");
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

  const status = describeBoardStatus(game, connection, move.isPending);

  return (
    <div className="@container rounded-[16px] bg-[#0a0e19] p-[10px] shadow-[0_0_0_1px_rgb(21_32_38/0.9)]">
      <div role="group" aria-label="Chess board" className="aspect-square w-full">
        <ChessboardAdapter
          fen={game.fen}
          orientation={orientation}
          highlights={highlights}
          interactive={canInteract}
          canDragFrom={(square) => Boolean(game.legalMoves[square]?.length)}
          onSquareSelect={selectSquare}
          onMoveRequest={requestMove}
          animate={!reducedMotion}
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
        color={viewerColor ?? "w"}
        onSelect={(piece) => pendingPromotion && sendMove(pendingPromotion.from, pendingPromotion.to, piece)}
        onCancel={() => setPromotion(null)}
      />
    </div>
  );
}
