import { httpClient } from "@/lib/http/browser-client";
import type {
  LeaderboardPage,
  LeaderboardPosition,
  RatingHistoryPage,
  RatingPool,
  RatingsResponse,
} from "@/features/ratings/types/ratings.types";

export async function getRatings(signal?: AbortSignal) {
  return (await httpClient.get<RatingsResponse>("/ratings/me", { signal }))
    .data;
}
export async function getRatingHistory(
  pool: RatingPool,
  cursor?: string,
  signal?: AbortSignal,
) {
  return (
    await httpClient.get<RatingHistoryPage>("/ratings/me/history", {
      params: { pool, cursor, limit: 25 },
      signal,
    })
  ).data;
}
export async function getLeaderboard(
  pool: RatingPool,
  page: number,
  signal?: AbortSignal,
) {
  return (
    await httpClient.get<LeaderboardPage>("/leaderboard", {
      params: { pool, page, limit: 25 },
      signal,
    })
  ).data;
}
export async function getLeaderboardPosition(
  pool: RatingPool,
  signal?: AbortSignal,
) {
  return (
    await httpClient.get<LeaderboardPosition>("/leaderboard/me", {
      params: { pool },
      signal,
    })
  ).data;
}
