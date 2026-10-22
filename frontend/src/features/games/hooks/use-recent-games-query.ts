"use client";

import { useQuery } from "@tanstack/react-query";
import { recentGamesQueryOptions } from "@/features/games/queries/game-history.queries";

export function useRecentGamesQuery(limit: number) {
  return useQuery(recentGamesQueryOptions(limit));
}
