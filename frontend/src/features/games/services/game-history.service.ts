import { httpClient } from "@/lib/http/browser-client";
import type { RecentGame, RecentGamesResponse } from "@/features/games/types/recent-game.types";
import type { HistoryFilters, HistoryPage } from "@/features/games/types/game-history.types";

export async function getGameHistory(filters: HistoryFilters, cursor?: string, signal?: AbortSignal): Promise<HistoryPage> {
  const { data } = await httpClient.get<HistoryPage>("/games", { params: { ...filters, cursor }, signal });
  return data;
}

export async function getRecentGames({ limit }: { limit: number }): Promise<RecentGame[]> {
  const { data } = await httpClient.get<RecentGamesResponse>("/games/recent", {
    params: { limit },
  });
  return data.items;
}
