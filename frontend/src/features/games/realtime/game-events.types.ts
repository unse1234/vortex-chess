import type { GameSnapshot } from "@/features/games/types/game.types";

/** Events delivered on a game's realtime channel. Complete snapshots, not patches. */
export type GameRealtimeEvent = { type: "game.snapshot"; payload: GameSnapshot };

export function gameChannel(gameId: string) {
  return `game:${gameId}`;
}
