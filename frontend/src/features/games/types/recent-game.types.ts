import type { UserSummary } from "@/types/user-summary.types";

export type GameResult = "win" | "loss" | "draw";

/** Presentation tier supplied by the backend alongside a rating. */
export type RatingTier = "standard" | "elite";

export type GamePlayer = UserSummary & {
  rating: number;
  ratingTier: RatingTier;
};

/** A finished game from the viewer's perspective. */
export type RecentGame = {
  id: string;
  result: GameResult;
  endedAt: string;
  viewer: GamePlayer;
  opponent: GamePlayer;
};

export type RecentGamesResponse = {
  items: RecentGame[];
};
