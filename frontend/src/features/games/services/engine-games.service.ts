import { httpClient } from "@/lib/http/browser-client";
import type { GameResponse } from "@/features/games/types/game-api.types";
import type { CreateEngineGameRequest, EngineStatus } from "@/features/games/types/engine-game.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

/** The browser only talks to our API; the backend alone reaches the engine service. */
export async function getEngineStatus(signal?: AbortSignal): Promise<EngineStatus> {
  const { data } = await httpClient.get<EngineStatus>("/engine-games/status", { signal });
  return data;
}

/**
 * Starts a game against the engine. The clock starts on the server once the
 * engine is confirmed ready; if the engine plays White it moves first.
 * A 409 `engine_game_active` carries the existing game's id in `details.gameId`.
 */
export async function createEngineGame(request: CreateEngineGameRequest): Promise<GameSnapshot> {
  const { data } = await httpClient.post<GameResponse>("/engine-games", request);
  return data.game;
}
