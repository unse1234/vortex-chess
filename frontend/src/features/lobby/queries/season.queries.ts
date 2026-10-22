import { queryOptions } from "@tanstack/react-query";
import { getCurrentSeason } from "@/features/lobby/services/season.service";

export const seasonKeys = {
  current: ["seasons", "current"] as const,
};

export function currentSeasonQueryOptions() {
  return queryOptions({
    queryKey: seasonKeys.current,
    queryFn: getCurrentSeason,
    staleTime: 10 * 60_000,
  });
}
