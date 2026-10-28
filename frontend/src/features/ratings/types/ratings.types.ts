import type { RatingPool, RatingChange } from "@/types/rating.types";
export type {
  RatingPool,
  RatingChange,
  GameRating,
} from "@/types/rating.types";
export const ratingPools: readonly RatingPool[] = ["bullet", "blitz", "rapid"];
export type RatingProfile = {
  pool: RatingPool;
  rating: number;
  peakRating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  revision: number;
  provisional: boolean;
  placementsRemaining: number;
};
export type RatingsResponse = { policyVersion: string; items: RatingProfile[] };
export type RatingHistoryPage = {
  items: (RatingChange & {
    gameId: string;
    pool: RatingPool;
    createdAt: string;
    policyVersion: string;
    opponent: { id: string; username: string };
  })[];
  nextCursor: string | null;
};
export type LeaderboardPage = {
  pool: RatingPool;
  page: number;
  limit: number;
  total: number;
  asOf: number;
  items: {
    user: { id: string; username: string };
    rank: number;
    rating: number;
    games: number;
    wins: number;
    draws: number;
    losses: number;
  }[];
};
export type LeaderboardPosition = RatingProfile & {
  status: "ranked" | "provisional" | "ineligible";
  rank: number | null;
  asOf: number;
};
