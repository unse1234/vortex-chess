import { http, HttpResponse } from "msw";
import type { SessionResponse } from "@/features/auth/types/session.types";
import type { CurrentSeasonResponse } from "@/features/lobby/types/season.types";
import { createCurrentSeason } from "@/mocks/fixtures/account.fixtures";
import { apiPath } from "@/mocks/handlers/api-path";
import { simulateNetwork } from "@/mocks/scenarios/network";
import { getMockSessionUser, setMockSessionUser } from "@/mocks/session-state";

export const sessionHandlers = [
  http.get(apiPath("/session"), async () => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    const user = getMockSessionUser();
    if (!user) {
      return HttpResponse.json(
        { code: "unauthenticated", message: "Sign in to continue." },
        { status: 401 },
      );
    }
    return HttpResponse.json<SessionResponse>({ user });
  }),

  http.post(apiPath("/session/sign-out"), async () => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    setMockSessionUser(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(apiPath("/seasons/current"), async () => {
    const failure = await simulateNetwork();
    if (failure) return failure;
    return HttpResponse.json<CurrentSeasonResponse>({ season: createCurrentSeason(Date.now()) });
  }),
];
