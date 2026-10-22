import { http, HttpResponse } from "msw";
import type { RecentGamesResponse } from "@/features/games/types/recent-game.types";
import { createRecentGames } from "@/mocks/fixtures/games.fixtures";
import { apiPath } from "@/mocks/handlers/api-path";
import { getMockScenario, simulateNetwork } from "@/mocks/scenarios/network";

const MAX_LIMIT = 20;

export const gamesHandlers = [
  http.get(apiPath("/games/recent"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const requested = Number(new URL(request.url).searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), MAX_LIMIT) : 10;
    const games = getMockScenario() === "empty" ? [] : createRecentGames(Date.now());

    return HttpResponse.json<RecentGamesResponse>({ items: games.slice(0, limit) });
  }),
];
