import { httpClient } from "@/lib/http/browser-client";
import type { CurrentSeasonResponse, Season } from "@/features/lobby/types/season.types";

/** The active ranked season, or null between seasons. */
export async function getCurrentSeason(): Promise<Season | null> {
  const { data } = await httpClient.get<CurrentSeasonResponse>("/seasons/current");
  return data.season;
}
