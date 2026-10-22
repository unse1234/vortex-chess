import { httpClient } from "@/lib/http/browser-client";
import { env } from "@/config/env";
import { establishSession } from "@/features/auth/services/auth-session.service";
import type {
  SignInRequest,
  SignUpRequest,
  UsernameAvailability,
} from "@/features/auth/types/auth.types";
import type {
  AccountSummary,
  SessionResponse,
} from "@/features/auth/types/session.types";
export async function signIn(request: SignInRequest): Promise<AccountSummary> {
  if (!env.apiMocking) return establishSession("/auth/sign-in", request);
  const { data } = await httpClient.post<SessionResponse>(
    "/auth/sign-in",
    request,
    { skipAuthentication: true },
  );
  return data.user;
}
export async function signUp(request: SignUpRequest): Promise<AccountSummary> {
  if (!env.apiMocking) return establishSession("/auth/sign-up", request);
  const { data } = await httpClient.post<SessionResponse>(
    "/auth/sign-up",
    request,
    { skipAuthentication: true },
  );
  return data.user;
}
export async function getUsernameAvailability(
  username: string,
  signal?: AbortSignal,
): Promise<UsernameAvailability> {
  const { data } = await httpClient.get<UsernameAvailability>(
    "/auth/username-availability",
    { params: { username }, signal, skipAuthentication: true },
  );
  return data;
}
