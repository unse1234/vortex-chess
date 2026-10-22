import { queryOptions } from "@tanstack/react-query";
import { getRecentGames } from "@/features/games/services/game-history.service";

export const gameHistoryKeys = {
  all: ["games", "history"] as const,
  recent: (limit: number) => [...gameHistoryKeys.all, "recent", { limit }] as const,
};

export function recentGamesQueryOptions(limit: number) {
  return queryOptions({
    queryKey: gameHistoryKeys.recent(limit),
    queryFn: () => getRecentGames({ limit }),
  });
}
