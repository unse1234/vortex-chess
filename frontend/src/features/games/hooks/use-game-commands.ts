"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/feedback/toast";
import { RealtimeRequestError, type RealtimeClient } from "@/lib/realtime/realtime-contract";
import { sendGameCommand } from "@/features/games/services/game.service";
import type {
  DrawResponse,
  GameCommandType,
  PendingCommand,
} from "@/features/games/types/game-command.types";
import type { GameUpdate, PromotionPiece, Square } from "@/features/games/types/game.types";

/** Attempts at resolving one uncertain command before giving it up. */
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1_200;

const FAILURE_TITLES: Record<GameCommandType, string> = {
  "game.move": "Move not accepted",
  "game.resign": "Couldn't resign",
  "game.draw.offer": "Couldn't offer a draw",
  "game.draw.respond": "Couldn't answer the draw offer",
};

type Options = {
  gameId: string;
  realtime: RealtimeClient | null;
  /** The revision moves are based on. */
  revision: number;
  /** True only while connected and synchronized. */
  canSend: boolean;
  /** Reconciles authoritative state from an acknowledgement into the cache. */
  applyUpdate: (update: GameUpdate) => void;
  /** Fetches a fresh snapshot when an answer can't be reconciled locally. */
  resync: () => void;
};

/**
 * Player commands for one game. One command is in flight at a time; while it
 * is, the board takes no new input. The server stays authoritative: a command
 * changes what is shown only through the state it acknowledges. When no
 * acknowledgement arrives, the outcome is uncertain, so the identical command
 * (same request id) is sent again once the connection is usable; the server
 * answers a repeat from its ledger instead of applying it twice.
 */
export function useGameCommands({ gameId, realtime, revision, canSend, applyUpdate, resync }: Options) {
  const showToast = useToast();
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const attempts = useRef(0);

  const dispatch = useCallback(
    async (command: PendingCommand) => {
      if (!realtime) return;
      attempts.current += 1;
      setPending({ ...command, status: "sending" });
      try {
        const ack = await sendGameCommand(realtime, command.type, command.payload);
        if (ack.game) applyUpdate(ack.game);
        if (ack.ok) {
          setPending(null);
          return;
        }
        if (ack.error.retryable && attempts.current < MAX_ATTEMPTS) {
          setPending({ ...command, status: "uncertain" });
          return;
        }
        setPending(null);
        if (!ack.game) resync();
        showToast({ title: FAILURE_TITLES[command.type], description: ack.error.message });
      } catch (error) {
        if (error instanceof RealtimeRequestError && error.reason === "not-connected") {
          // Never sent, so nothing to reconcile.
          setPending(null);
          showToast({ title: FAILURE_TITLES[command.type], description: "You're not connected. Try again in a moment." });
        } else if (attempts.current < MAX_ATTEMPTS) {
          setPending({ ...command, status: "uncertain" });
        } else {
          setPending(null);
          resync();
          showToast({ title: FAILURE_TITLES[command.type], description: "The server didn't confirm it. The board shows the latest saved state." });
        }
      }
    },
    [realtime, applyUpdate, resync, showToast],
  );

  // An uncertain command is resolved before anything else can be sent.
  useEffect(() => {
    if (pending?.status !== "uncertain" || !canSend) return;
    const timer = setTimeout(() => void dispatch(pending), RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, canSend, dispatch]);

  const send = useCallback(
    (type: GameCommandType, fields: Record<string, unknown>) => {
      if (pending || !canSend) return false;
      attempts.current = 0;
      void dispatch({ type, payload: { gameId, requestId: crypto.randomUUID(), ...fields }, status: "sending" });
      return true;
    },
    [pending, canSend, dispatch, gameId],
  );

  return {
    pending,
    move: (from: Square, to: Square, promotion?: PromotionPiece) =>
      send("game.move", { expectedRevision: revision, from, to, ...(promotion ? { promotion } : {}) }),
    resign: () => send("game.resign", {}),
    offerDraw: () => send("game.draw.offer", {}),
    respondToDraw: (response: DrawResponse) => send("game.draw.respond", { response }),
  };
}

export type GameCommands = ReturnType<typeof useGameCommands>;

/** The move awaiting its answer, for provisional display on the board. */
export function pendingMoveOf(commands: GameCommands) {
  const { pending } = commands;
  if (pending?.type !== "game.move") return null;
  const { from, to, promotion } = pending.payload as unknown as { from: Square; to: Square; promotion?: PromotionPiece };
  return { from, to, promotion, uncertain: pending.status === "uncertain" };
}
