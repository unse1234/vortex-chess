import { http, HttpResponse } from "msw";
import type { RecentGamesResponse } from "@/features/games/types/recent-game.types";
import { createRecentGames } from "@/mocks/fixtures/games.fixtures";
import { apiPath } from "@/mocks/handlers/api-path";
import { getMockScenario, simulateNetwork } from "@/mocks/scenarios/network";
import { getMockSessionUser } from "@/mocks/session-state";
import type { HistoryPage } from "@/features/games/types/game-history.types";

const MAX_LIMIT = 20;

export const gamesHandlers = [
  http.get(apiPath("/games"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    if (!getMockSessionUser())
      return HttpResponse.json(
        { code: "unauthenticated", message: "Sign in to continue." },
        { status: 401 },
      );
    const params = new URL(request.url).searchParams;
    const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 20)));
    const offset = Number(params.get("cursor")?.replace("demo:", "") ?? 0);
    const items = (
      getMockScenario() === "empty" ? [] : createRecentGames(Date.now())
    )
      .filter(
        (game) =>
          (!params.get("result") || game.result === params.get("result")) &&
          params.get("side") !== "b",
      )
      .map((game) => ({
        ...game,
        side: "w" as const,
        mode: "friends" as const,
        startedAt: game.endedAt,
        timeControl: {
          category: "blitz" as const,
          initialMs: 180000,
          incrementMs: 2000,
        },
      }));
    return HttpResponse.json<HistoryPage>({
      items: items.slice(offset, offset + limit),
      nextCursor:
        items.length > offset + limit ? `demo:${offset + limit}` : null,
    });
  }),
  http.get(apiPath("/games/recent"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const requested = Number(
      new URL(request.url).searchParams.get("limit") ?? 10,
    );
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), MAX_LIMIT)
      : 10;
    const games =
      getMockScenario() === "empty" ? [] : createRecentGames(Date.now());

    return HttpResponse.json<RecentGamesResponse>({
      items: games.slice(0, limit),
    });
  }),
];
