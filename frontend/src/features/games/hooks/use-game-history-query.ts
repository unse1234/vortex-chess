"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { gameHistoryKeys } from "@/features/games/queries/game-history.queries";
import { getGameHistory } from "@/features/games/services/game-history.service";
import type { HistoryFilters } from "@/features/games/types/game-history.types";

export function useGameHistoryQuery(
  userId: string | undefined,
  filters: HistoryFilters,
) {
  return useInfiniteQuery({
    queryKey: [...gameHistoryKeys.all, userId, filters],
    queryFn: ({ pageParam, signal }) =>
      getGameHistory(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(userId),
  });
}
