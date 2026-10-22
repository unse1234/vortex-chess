import { httpClient } from "@/lib/http/browser-client";
import type { RecentGame, RecentGamesResponse } from "@/features/games/types/recent-game.types";

export async function getRecentGames({ limit }: { limit: number }): Promise<RecentGame[]> {
  const { data } = await httpClient.get<RecentGamesResponse>("/games/recent", {
    params: { limit },
  });
  return data.items;
}
