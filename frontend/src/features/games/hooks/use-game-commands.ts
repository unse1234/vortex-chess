"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/feedback/toast";
import { ApiError } from "@/lib/http/api-error";
import { gameKeys } from "@/features/games/queries/game.keys";
import {
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import {
  offerDraw,
  resignGame,
  respondToDraw,
  submitMove,
} from "@/features/games/services/game.service";
import type { DrawResponse, MoveCommand } from "@/features/games/types/game-command.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

/** Error codes meaning our snapshot is out of date and should be refreshed. */
const RESYNC_CODES = new Set(["stale_revision", "not_your_turn", "game_finished"]);

/**
 * Player commands for one game. The server stays authoritative: a command
 * only changes what's on screen when its answer (the new snapshot) arrives,
 * and it is merged through the same revision policy as realtime updates.
 */
export function useGameCommands(gameId: string) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const queryKey = gameKeys.detail(gameId);
  // Commands for one game run one at a time, in order.
  const scope = { id: queryKey.join(":") };

  function applySnapshot(snapshot: GameSnapshot) {
    queryClient.setQueryData<GameSnapshot>(queryKey, (current) =>
      stampSnapshotReceived(reconcileGameSnapshot(current, snapshot)),
    );
  }

  function handleFailure(title: string) {
    return (error: Error) => {
      const message = error instanceof ApiError ? error.message : "Something went wrong.";
      showToast({ title, description: message });
      if (error instanceof ApiError && RESYNC_CODES.has(error.code)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
  }

  const move = useMutation<GameSnapshot, Error, MoveCommand>({
    scope,
    mutationFn: (command) => submitMove(gameId, command),
    onSuccess: applySnapshot,
    onError: handleFailure("Move not accepted"),
  });

  const resign = useMutation<GameSnapshot, Error, void>({
    scope,
    mutationFn: () => resignGame(gameId),
    onSuccess: applySnapshot,
    onError: handleFailure("Couldn't resign"),
  });

  const offer = useMutation<GameSnapshot, Error, void>({
    scope,
    mutationFn: () => offerDraw(gameId),
    onSuccess: applySnapshot,
    onError: handleFailure("Couldn't offer a draw"),
  });

  const respond = useMutation<GameSnapshot, Error, DrawResponse>({
    scope,
    mutationFn: (response) => respondToDraw(gameId, response),
    onSuccess: applySnapshot,
    onError: handleFailure("Couldn't answer the draw offer"),
  });

  return { move, resign, offer, respond };
}

export type GameCommands = ReturnType<typeof useGameCommands>;
