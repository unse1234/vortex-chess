import type { TimeControl } from "@/types/time-control.types";

export type MatchmakingStatus = {
  revision: number;
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
  timeControls: (TimeControl & { id: string })[];
  defaultTimeControlId: string;
  searchTtlMs: number;
  arrivalTtlMs: number;
};
