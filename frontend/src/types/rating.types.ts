/** Shared wire values. Rating calculations and ranking belong to the API. */
export type RatingPool = "bullet" | "blitz" | "rapid";
export type RatingChange = {
  before: number;
  delta: number;
  after: number;
  score: number;
};
export type GameRating = {
  rated: boolean;
  pool: RatingPool | null;
  policyVersion: string | null;
  snapshots: Record<
    "w" | "b",
    { rating: number; games: number; provisional: boolean } | null
  >;
  changes: Record<"w" | "b", RatingChange | null> | null;
};
