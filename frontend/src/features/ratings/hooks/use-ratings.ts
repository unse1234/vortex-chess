"use client";
import { useEffect } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { features } from "@/config/capabilities";
import {
  useRealtimeClient,
  useRealtimeStatus,
} from "@/lib/realtime/realtime-context";
import { PERSONAL_CHANNEL } from "@/lib/realtime/realtime-contract";
import {
  leaderboardOptions,
  positionOptions,
  ratingHistoryOptions,
  ratingsKeys,
  ratingsOptions,
} from "@/features/ratings/queries/ratings.queries";
import type { RatingPool } from "@/features/ratings/types/ratings.types";

export function useRatings(accountId: string) {
  return useQuery({
    ...ratingsOptions(accountId),
    enabled: !!accountId && features.ratings.available,
  });
}
export function useLeaderboard(
  accountId: string,
  pool: RatingPool,
  page: number,
) {
  const enabled = !!accountId && features.leaderboard.available;
  const leaderboard = useQuery({ ...leaderboardOptions(pool, page), enabled });
  const position = useQuery({ ...positionOptions(accountId, pool), enabled });
  const history = useInfiniteQuery({
    ...ratingHistoryOptions(accountId, pool),
    enabled,
  });
  return { leaderboard, position, history };
}
/** Once per session: personal invalidations plus bounded reads recover missed events across instances. */
export function useRatingsSync(accountId: string) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const connection = useRealtimeStatus(realtime);
  useEffect(() => {
    if (!accountId || !features.ratings.available) return;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ratingsKeys.all });
    };
    if (connection === "connected") refresh();
    return realtime?.subscribe(PERSONAL_CHANNEL, (event) => {
      if (event.type === "ratings.updated") refresh();
    });
  }, [accountId, connection, queryClient, realtime]);
}
