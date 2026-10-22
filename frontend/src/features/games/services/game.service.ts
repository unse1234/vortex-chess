import { httpClient } from "@/lib/http/browser-client";
import type { GameResponse } from "@/features/games/types/game-api.types";
import type { DrawResponse, MoveCommand } from "@/features/games/types/game-command.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;

export async function getGame(gameId: string, signal?: AbortSignal): Promise<GameSnapshot> {
  const { data } = await httpClient.get<GameResponse>(gamePath(gameId), { signal });
  return data.game;
}

/** Asks the server to play a move; the answer is the authoritative snapshot or a rejection. */
export async function submitMove(gameId: string, command: MoveCommand): Promise<GameSnapshot> {
  const { data } = await httpClient.post<GameResponse>(`${gamePath(gameId)}/moves`, command);
  return data.game;
}

export async function resignGame(gameId: string): Promise<GameSnapshot> {
  const { data } = await httpClient.post<GameResponse>(`${gamePath(gameId)}/resign`);
  return data.game;
}

export async function offerDraw(gameId: string): Promise<GameSnapshot> {
  const { data } = await httpClient.post<GameResponse>(`${gamePath(gameId)}/draw-offer`);
  return data.game;
}

export async function respondToDraw(gameId: string, response: DrawResponse): Promise<GameSnapshot> {
  const { data } = await httpClient.post<GameResponse>(`${gamePath(gameId)}/draw-offer/response`, {
    response,
  });
  return data.game;
}
