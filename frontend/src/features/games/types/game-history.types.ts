import type { RecentGame } from "@/features/games/types/recent-game.types";
import type { Color } from "@/features/games/types/game.types";
import type { TimeControl } from "@/types/time-control.types";

export type HistoryGame = RecentGame & {
  side: Color;
  mode: "friends";
  startedAt: string;
  timeControl: TimeControl;
};
export type HistoryFilters = {
  limit?: number;
  side?: Color;
  result?: "win" | "loss" | "draw";
};
export type HistoryPage = { items: HistoryGame[]; nextCursor: string | null };
