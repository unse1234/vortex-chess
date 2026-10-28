import type { Pool } from './rating-policy';
export type RatingSnapshot = {
  rating: number;
  games: number;
  provisional: boolean;
};
export type AppliedRatingChange = {
  before: number;
  delta: number;
  after: number;
  score: number;
};
export type GameRatingView = {
  rated: boolean;
  pool: Pool | null;
  policyVersion: string | null;
  snapshots: Record<'w' | 'b', RatingSnapshot | null>;
  changes: Record<'w' | 'b', AppliedRatingChange | null> | null;
};
export const casualRating = (): GameRatingView => ({
  rated: false,
  pool: null,
  policyVersion: null,
  snapshots: { w: null, b: null },
  changes: null,
});
