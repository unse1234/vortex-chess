"use client";

import { ComingSoon } from "@/components/display/coming-soon";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { routes } from "@/config/routes";
import { summarizeResult } from "@/features/games/result-text";
import type { GameResult, ViewerPermissions } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

type GameResultDialogProps = {
  gameId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: GameResult;
  viewer: ViewerPermissions;
};

/** Announces how a game ended, over the final position. */
export function GameResultDialog({ gameId, open, onOpenChange, result, viewer }: GameResultDialogProps) {
  const summary = summarizeResult(result, viewer);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Game over"
      description={summary.detail}
      footer={
        <>
          <Link href={routes.game(gameId)} onClick={() => onOpenChange(false)} className="rounded-md px-4 py-2 text-sm font-semibold">Replay game</Link>
          <Link
            href={routes.play}
            data-autofocus
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-[#1b1305] transition-colors hover:bg-accent-strong"
          >
            Back to lobby
          </Link>
        </>
      }
    >
      <div className="px-5 py-5">
        <p
          className={cn(
            "font-display text-[34px] font-bold leading-none tracking-wide",
            summary.tone === "win" ? "text-success" : summary.tone === "loss" ? "text-danger" : "text-fg",
          )}
        >
          {summary.headline.toUpperCase()}
        </p>
        <p className="mt-3 text-sm text-fg-muted">Rating <ComingSoon feature="ratings" /></p>
      </div>
    </Dialog>
  );
}
