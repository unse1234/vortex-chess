import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";
import { gameKeys } from "@/features/games/queries/game.keys";
import {
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import { getGame } from "@/features/games/services/game.service";
import type { GameSnapshot } from "@/features/games/types/game.types";

/** Only transient failures are worth retrying; a missing game stays missing. */
function retryGameQuery(failureCount: number, error: Error) {
  if (error instanceof ApiError && !error.retryable) return false;
  return failureCount < 2;
}

export function gameQueryOptions(gameId: string, options: { pollMs?: number | false } = {}) {
  return queryOptions({
    queryKey: gameKeys.detail(gameId),
    queryFn: ({ signal }) => getGame(gameId, signal),
    // Also applied to fetch completions, so a stale refetch after a newer
    // realtime event keeps the newer snapshot.
    structuralSharing: (oldData, newData) =>
      stampSnapshotReceived(
        reconcileGameSnapshot(oldData as GameSnapshot | undefined, newData as GameSnapshot),
      ),
    retry: retryGameQuery,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.status.phase === "finished" ? false : (options.pollMs ?? false),
  });
}
