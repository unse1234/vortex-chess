import { httpClient } from "@/lib/http/browser-client";
import type { RealtimeClient } from "@/lib/realtime/realtime-contract";
import type { GameResponse } from "@/features/games/types/game-api.types";
import type { GameCommandAck, GameCommandType } from "@/features/games/types/game-command.types";
import type { GameSnapshot } from "@/features/games/types/game.types";

const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;

/** The complete authorized snapshot, including the accepted move history. */
export async function getGame(gameId: string, signal?: AbortSignal): Promise<GameSnapshot> {
  const { data } = await httpClient.get<GameResponse>(gamePath(gameId), { signal });
  return data.game;
}

const COMMAND_TIMEOUT_MS = 5_000;

/**
 * Sends a game command over the realtime connection and returns the server's
 * acknowledgement. Rejects with RealtimeRequestError when there is no answer;
 * a "timeout" leaves the outcome unknown, so callers resend the identical
 * command (same request id) once reconnected.
 */
export async function sendGameCommand(
  realtime: RealtimeClient,
  type: GameCommandType,
  payload: Record<string, unknown>,
): Promise<GameCommandAck> {
  return (await realtime.request(type, payload, { timeoutMs: COMMAND_TIMEOUT_MS })) as GameCommandAck;
}
