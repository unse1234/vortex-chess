import type { EngineTurn, GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

/**
 * Events on a game's authorized channel. Joining (and every rejoin) delivers a
 * complete snapshot, the synchronization boundary; committed changes arrive as
 * compact updates carrying only the newly accepted move.
 */
export type GameRealtimeEvent =
  | { type: "game.snapshot"; payload: { game: GameSnapshot } }
  | { type: "game.updated"; payload: GameUpdate }
  | { type: "game.presence"; payload: { id: string; userId: string; online: boolean } }
  /** Engine progress for one revision; never game state. */
  | { type: "game.engine"; payload: { id: string; revision: number; engineTurn: EngineTurn | null } };

export function gameChannel(gameId: string) {
  return `game:${gameId}`;
}
