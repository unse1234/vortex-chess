import { http, HttpResponse } from "msw";
import type {
  SignInRequest,
  SignUpRequest,
  UsernameAvailability,
} from "@/features/auth/types/auth.types";
import type { SessionResponse } from "@/features/auth/types/session.types";
import { demoAccount } from "@/mocks/fixtures/account.fixtures";
import {
  createNewAccount,
  demoCredentials,
  MOCK_CALL_SIGN_TAG,
  registeredEmails,
  registeredUsernames,
} from "@/mocks/fixtures/auth.fixtures";
import { apiPath } from "@/mocks/handlers/api-path";
import { simulateNetwork } from "@/mocks/scenarios/network";
import { setMockSessionUser } from "@/mocks/session-state";

function isTaken(username: string) {
  return registeredUsernames.includes(username.trim().toLowerCase());
}

export const authHandlers = [
  http.post(apiPath("/auth/sign-in"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const { email, password } = (await request.json()) as SignInRequest;
    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    const knownIdentity = demoCredentials.emails.includes(normalized);

    if (!knownIdentity || typeof password !== "string" || password.length < demoCredentials.minPasswordLength) {
      return HttpResponse.json(
        {
          code: "invalid_credentials",
          message:
            "Email or password is incorrect. (Preview: use haseeb@vortex.io with any 8+ character password.)",
        },
        { status: 401 },
      );
    }

    setMockSessionUser(demoAccount);
    return HttpResponse.json<SessionResponse>({ user: demoAccount });
  }),

  http.post(apiPath("/auth/sign-up"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const body = (await request.json()) as SignUpRequest;
    const fieldErrors: Record<string, string[]> = {};
    if (isTaken(body.username)) fieldErrors.username = ["That call sign is already taken."];
    if (registeredEmails.includes(body.email.trim().toLowerCase())) {
      fieldErrors.email = ["An operator with this email already exists."];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return HttpResponse.json(
        { code: "conflict", message: "Some details are already in use.", fieldErrors },
        { status: 409 },
      );
    }

    const user = createNewAccount(body.username.trim(), body.email.trim().toLowerCase());
    setMockSessionUser(user);
    return HttpResponse.json<SessionResponse>({ user }, { status: 201 });
  }),

  http.get(apiPath("/auth/username-availability"), async ({ request }) => {
    const failure = await simulateNetwork();
    if (failure) return failure;

    const username = new URL(request.url).searchParams.get("username") ?? "";
    const available = !isTaken(username);
    return HttpResponse.json<UsernameAvailability>({
      username,
      available,
      tag: available ? MOCK_CALL_SIGN_TAG : null,
    });
  }),
];
