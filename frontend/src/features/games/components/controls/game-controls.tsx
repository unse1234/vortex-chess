"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/feedback/toast";
import { FlagIcon, HandshakeIcon, SwapVertIcon } from "@/components/ui/icons";
import {
  IncomingDrawDialog,
  OfferDrawDialog,
} from "@/features/games/components/dialogs/draw-dialogs";
import { GameResultDialog } from "@/features/games/components/dialogs/game-result-dialog";
import { ResignDialog } from "@/features/games/components/dialogs/resign-dialog";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import { cn } from "@/utils/cn";

const controlBase =
  "inline-flex h-[34px] items-center justify-center gap-[8px] rounded-[4px] px-[12px] font-display text-[15px] font-medium transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-45 sm:h-[40px] sm:px-[15px] sm:text-[18px]";

/** Flip, offer draw and resign, plus the dialogs those actions and the game's end open. */
export function GameControls() {
  const { game, commands, flipBoard, connectionAllowsCommands } = useGameSession();
  const showToast = useToast();
  const [resignOpen, setResignOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  // An offer closed without an answer stays closed until the next move changes the position.
  const [dismissedOfferAtPly, setDismissedOfferAtPly] = useState<number | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  // Only a game that ends while it's being watched pops up its result.
  const [startedInProgress] = useState(game.status.phase === "in-progress");

  const { viewer, drawOffer } = game;
  const finished = game.status.phase === "finished";
  const offeredByViewer = drawOffer?.state === "pending" && drawOffer.by === viewer.color;
  const incomingOffer = drawOffer?.state === "pending" && drawOffer.by !== viewer.color && viewer.canRespondToDraw;
  const incomingOpen = incomingOffer && dismissedOfferAtPly !== game.ply;
  const pendingType = commands.pending?.type ?? null;
  // One command at a time, and only while synchronized.
  const busy = commands.pending !== null || !connectionAllowsCommands;

  // Tell the player once when the opponent declines their offer.
  const announcedDecline = useRef<number | null>(null);
  const declinedByOpponent = drawOffer?.state === "declined" && drawOffer.by === viewer.color;
  useEffect(() => {
    if (declinedByOpponent && announcedDecline.current !== game.revision) {
      announcedDecline.current = game.revision;
      showToast({ title: "Draw offer declined", description: "Your opponent wants to play on." });
    }
  }, [declinedByOpponent, game.revision, showToast]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-[8px] sm:gap-[10px]">
        <button
          type="button"
          onClick={flipBoard}
          className={cn(controlBase, "bg-[#1b202a] font-body font-normal text-[#eef3ff] hover:bg-[#222834] sm:h-[32px] sm:text-[16px]")}
        >
          <SwapVertIcon aria-hidden className="text-[20px] text-auth-label" />
          Flip
        </button>

        {incomingOffer && !incomingOpen ? (
          <button
            type="button"
            onClick={() => setDismissedOfferAtPly(null)}
            className={cn(controlBase, "bg-[#3a2f1d] text-auth-amber hover:brightness-110")}
          >
            Respond to draw offer
          </button>
        ) : (
          <button
            type="button"
            disabled={!viewer.canOfferDraw || offeredByViewer || finished || busy}
            onClick={() => setOfferOpen(true)}
            aria-haspopup="dialog"
            className={cn(controlBase, "bg-[#1b202a] text-auth-amber hover:bg-[#222834]")}
          >
            <HandshakeIcon aria-hidden className="text-[22px]" />
            {offeredByViewer ? "Draw Offered" : "Offer Draw"}
          </button>
        )}

        <button
          type="button"
          disabled={!viewer.canResign || finished || busy}
          onClick={() => setResignOpen(true)}
          aria-haspopup="dialog"
          className={cn(controlBase, "bg-[#400812] text-[#ffbeb5] hover:bg-[#4d1020]")}
        >
          <FlagIcon aria-hidden className="text-[20px]" />
          Resign
        </button>
      </div>

      <ResignDialog
        open={resignOpen}
        onOpenChange={setResignOpen}
        pending={pendingType === "game.resign"}
        onConfirm={() => {
          if (commands.resign()) setResignOpen(false);
        }}
      />
      <OfferDrawDialog
        open={offerOpen}
        onOpenChange={setOfferOpen}
        pending={pendingType === "game.draw.offer"}
        onConfirm={() => {
          if (commands.offerDraw()) setOfferOpen(false);
        }}
      />
      <IncomingDrawDialog
        open={incomingOpen}
        pending={busy}
        onDismiss={() => setDismissedOfferAtPly(game.ply)}
        onAccept={() => commands.respondToDraw("accept")}
        onDecline={() => commands.respondToDraw("decline")}
      />
      {game.status.phase === "finished" ? (
        <GameResultDialog
          gameId={game.id}
          open={startedInProgress && !resultDismissed}
          onOpenChange={(open) => setResultDismissed(!open)}
          result={game.status.result}
          viewer={viewer}
        />
      ) : null}
    </>
  );
}
