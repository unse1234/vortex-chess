import { http, HttpResponse } from "msw";
import type { GameResponse } from "@/features/games/types/game-api.types";
import type {
  MatchMessagesResponse,
  SendMatchMessageResponse,
} from "@/features/social/types/match-chat.types";
import { apiPath } from "@/mocks/handlers/api-path";
import {
  buildSnapshot,
  getChat,
  getGameRoom,
  postChatMessage,
} from "@/mocks/scenarios/game-room.scenario";
import { simulateNetwork } from "@/mocks/scenarios/network";
import { getMockSessionUser } from "@/mocks/session-state";

const unauthenticated = () =>
  HttpResponse.json(
    { code: "unauthenticated", message: "Sign in to continue." },
    { status: 401 },
  );

const notFound = () =>
  HttpResponse.json(
    {
      code: "game_not_found",
      message: "This game doesn't exist, or you don't have access to it.",
    },
    { status: 404 },
  );

/** Snapshots and match chat. Game commands go through the mock realtime client, as in production. */
export const gameRoomHandlers = [
  http.post(apiPath("/games/:gameId/analysis/preview"), async ({ params }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    if (!getMockSessionUser()) return unauthenticated();
    const game = getGameRoom(String(params.gameId));
    if (!game) return notFound();
    if (buildSnapshot(game).status.phase !== "finished")
      return HttpResponse.json(
        {
          code: "analysis_requires_finished_game",
          message: "Manual analysis is available after the game finishes.",
        },
        { status: 409 },
      );
    return HttpResponse.json(
      {
        code: "scripted_demo_only",
        message:
          "Manual variations require the real backend. This demo only contains recorded positions.",
      },
      { status: 503 },
    );
  }),
  http.get(apiPath("/games/:gameId"), async ({ params }) => {
    const unavailable = await simulateNetwork();
    if (unavailable) return unavailable;
    const user = getMockSessionUser();
    if (!user) return unauthenticated();
    const game = getGameRoom(String(params.gameId));
    if (!game) return notFound();
    return HttpResponse.json<GameResponse>({ game: buildSnapshot(game) });
  }),

  http.get(apiPath("/games/:gameId/chat"), async ({ params }) => {
    const unavailable = await simulateNetwork();
    if (unavailable) return unavailable;
    if (!getMockSessionUser()) return unauthenticated();
    const gameId = String(params.gameId);
    if (!getGameRoom(gameId)) return notFound();
    return HttpResponse.json<MatchMessagesResponse>({ items: getChat(gameId) });
  }),

  http.post(apiPath("/games/:gameId/chat"), async ({ params, request }) => {
    const unavailable = await simulateNetwork();
    if (unavailable) return unavailable;
    const user = getMockSessionUser();
    if (!user) return unauthenticated();
    const gameId = String(params.gameId);
    if (!getGameRoom(gameId)) return notFound();
    const { body } = (await request.json()) as { body: string };
    const trimmed = body?.trim().slice(0, 200);
    if (!trimmed) {
      return HttpResponse.json(
        { code: "empty_message", message: "Write something first." },
        { status: 422 },
      );
    }
    return HttpResponse.json<SendMatchMessageResponse>(
      { message: postChatMessage(gameId, user, trimmed) },
      { status: 201 },
    );
  }),
];
