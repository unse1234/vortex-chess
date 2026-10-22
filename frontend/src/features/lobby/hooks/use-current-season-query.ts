"use client";

import { useQuery } from "@tanstack/react-query";
import { currentSeasonQueryOptions } from "@/features/lobby/queries/season.queries";

export function useCurrentSeasonQuery() {
  return useQuery(currentSeasonQueryOptions());
}
