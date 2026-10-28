import { queryOptions } from "@tanstack/react-query";
import { getMatchmakingOptions, getMatchmakingStatus } from "@/features/matchmaking/services/matchmaking.service";
import { reconcileMatchmaking } from "@/features/matchmaking/realtime/matchmaking-events";
import type { MatchmakingStatus } from "@/features/matchmaking/types/matchmaking.types";

export const matchmakingKeys = {
  status: (accountId: string) => ["matchmaking", "status", accountId] as const,
  options: ["matchmaking", "options"] as const,
};
export function matchmakingStatusOptions(accountId: string) {
  return queryOptions({
    queryKey: matchmakingKeys.status(accountId), queryFn: ({ signal }) => getMatchmakingStatus(signal),
    structuralSharing: (oldData, newData) => reconcileMatchmaking(oldData as MatchmakingStatus | undefined, newData as MatchmakingStatus),
    staleTime: 0, retry: 1,
    refetchInterval: (query) => query.state.data?.state === "idle" ? 10000 : 2000,
  });
}
export const matchmakingOptions = () => queryOptions({
  queryKey: matchmakingKeys.options, queryFn: ({ signal }) => getMatchmakingOptions(signal), staleTime: 30000, retry: 1,
});
