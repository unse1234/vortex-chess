import type { TimeControl } from "@/types/time-control.types";
import type { RatingPool } from "@/types/rating.types";

export type MatchmakingStatus = {
  revision: number;
  rated: boolean;
  ratingPool: RatingPool | null;
  state: "idle" | "searching" | "confirming" | "matched";
  searchId: string | null;
  timeControl: Pick<TimeControl, "initialMs" | "incrementMs"> | null;
  queuedAt: string | null;
  expiresAt: string | null;
  ready: boolean;
  gameId: string | null;
  reason: string | null;
  serverTime: number;
};
export type MatchmakingOptions = {
  enabled: boolean;
  ratingsEnabled: boolean;
  policyVersion: string;
  ratingWindows: { untilSeconds: number; difference: number }[];
  timeControls: (TimeControl & { id: string; ratingPool: RatingPool | null })[];
  defaultTimeControlId: string;
  searchTtlMs: number;
  arrivalTtlMs: number;
};
