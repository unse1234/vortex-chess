"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gameKeys } from "@/features/games/queries/game.keys";
import { stampSnapshotReceived } from "@/features/games/realtime/reconcile-game-snapshot";
import { createEngineGame, getEngineStatus } from "@/features/games/services/engine-games.service";
import { ApiError } from "@/lib/http/api-error";

export const engineGameKeys = {
  status: () => [...gameKeys.all, "engine-status"] as const,
};

export function engineStatusQueryOptions() {
  return queryOptions({
    queryKey: engineGameKeys.status(),
    queryFn: ({ signal }) => getEngineStatus(signal),
    staleTime: 15_000,
    retry: 1,
  });
}

/** Engine availability for the setup screen: checked on every visit and refreshed while open. */
export function useEngineStatusQuery() {
  return useQuery({ ...engineStatusQueryOptions(), refetchOnMount: "always", refetchInterval: 30_000 });
}

/** Creates the game and seeds its canonical cache entry with the returned snapshot. */
export function useCreateEngineGame() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createEngineGame,
    onSuccess: (game) => queryClient.setQueryData(gameKeys.detail(game.id), stampSnapshotReceived(game)),
    onError: (error) => {
      // The engine was reported unavailable: show the current status.
      if (error instanceof ApiError && error.status === 503)
        void queryClient.invalidateQueries({ queryKey: engineGameKeys.status() });
    },
  });
}

/** The id of the player's unfinished engine game, when creation refused a second one. */
export function activeEngineGameId(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== "engine_game_active") return null;
  return typeof error.details.gameId === "string" ? error.details.gameId : null;
}
