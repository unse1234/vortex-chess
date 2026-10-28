import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  getLeaderboard,
  getLeaderboardPosition,
  getRatingHistory,
  getRatings,
} from "@/features/ratings/services/ratings.service";
import type {
  LeaderboardPage,
  LeaderboardPosition,
  RatingPool,
  RatingsResponse,
} from "@/features/ratings/types/ratings.types";

export const ratingsKeys = {
  all: ["ratings"] as const,
  mine: (accountId: string) => ["ratings", "mine", accountId] as const,
  history: (accountId: string, pool: RatingPool) =>
    ["ratings", "history", accountId, pool] as const,
  position: (accountId: string, pool: RatingPool) =>
    ["ratings", "position", accountId, pool] as const,
  leaderboard: (pool: RatingPool, page: number) =>
    ["leaderboard", pool, page] as const,
};
export function reconcileRatings(
  current: RatingsResponse | undefined,
  incoming: RatingsResponse,
): RatingsResponse {
  if (!current) return incoming;
  return {
    ...incoming,
    items: incoming.items.map((next) => {
      const old = current.items.find((p) => p.pool === next.pool);
      return old && old.revision >= next.revision ? old : next;
    }),
  };
}
export const ratingsOptions = (accountId: string) =>
  queryOptions({
    queryKey: ratingsKeys.mine(accountId),
    queryFn: ({ signal }) => getRatings(signal),
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    structuralSharing: (old, next) =>
      reconcileRatings(
        old as RatingsResponse | undefined,
        next as RatingsResponse,
      ),
  });
export const leaderboardOptions = (pool: RatingPool, page: number) =>
  queryOptions({
    queryKey: ratingsKeys.leaderboard(pool, page),
    queryFn: ({ signal }) => getLeaderboard(pool, page, signal),
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    structuralSharing: (old, next) =>
      newerRead(old as LeaderboardPage | undefined, next as LeaderboardPage),
  });
export function newerRead<T extends { asOf: number }>(
  current: T | undefined,
  incoming: T,
) {
  return current && current.asOf > incoming.asOf ? current : incoming;
}
export function reconcilePosition(
  current: LeaderboardPosition | undefined,
  incoming: LeaderboardPosition,
) {
  if (current && current.revision !== incoming.revision)
    return current.revision > incoming.revision ? current : incoming;
  return newerRead(current, incoming);
}
export const positionOptions = (accountId: string, pool: RatingPool) =>
  queryOptions({
    queryKey: ratingsKeys.position(accountId, pool),
    queryFn: ({ signal }) => getLeaderboardPosition(pool, signal),
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    structuralSharing: (old, next) =>
      reconcilePosition(
        old as LeaderboardPosition | undefined,
        next as LeaderboardPosition,
      ),
  });
export const ratingHistoryOptions = (accountId: string, pool: RatingPool) =>
  infiniteQueryOptions({
    queryKey: ratingsKeys.history(accountId, pool),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getRatingHistory(pool, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30000,
  });
