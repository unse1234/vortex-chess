"use client";

import { Dialog } from "@/components/ui/dialog";
import type { Color, PromotionPiece } from "@/features/games/types/game.types";

const choices: readonly { piece: PromotionPiece; letter: string; label: string }[] = [
  { piece: "q", letter: "Q", label: "Queen" },
  { piece: "r", letter: "R", label: "Rook" },
  { piece: "b", letter: "B", label: "Bishop" },
  { piece: "n", letter: "N", label: "Knight" },
];

type PromotionDialogProps = {
  open: boolean;
  color: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
};

/** Asks which piece a pawn becomes when it reaches the far rank. */
export function PromotionDialog({ open, color, onSelect, onCancel }: PromotionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title="Promote your pawn"
      description="Choose the piece it becomes. The move is sent to the server once you pick."
    >
      <div className="grid grid-cols-4 gap-3 p-5">
        {choices.map(({ piece, letter, label }) => (
          <button
            key={piece}
            type="button"
            data-autofocus={piece === "q" ? true : undefined}
            onClick={() => onSelect(piece)}
            className="flex flex-col items-center gap-2 rounded-md bg-surface-raised px-2 py-4 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-hover"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG sprite */}
            <img src={`/chess/pieces/${color}${letter}.svg`} alt="" className="size-12" />
            {label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
