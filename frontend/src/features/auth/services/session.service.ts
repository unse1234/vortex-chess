import { httpClient } from "@/lib/http/browser-client";
import { env } from "@/config/env";
import {
  endLocalSession,
  getAccessToken,
  refreshSession,
} from "@/features/auth/services/auth-session.service";
import type {
  AccountSummary,
  SessionResponse,
} from "@/features/auth/types/session.types";
export async function getSession(): Promise<AccountSummary | null> {
  if (!env.apiMocking && !getAccessToken()) {
    await refreshSession();
  }
  const { data } = await httpClient.get<SessionResponse>("/session", {
    skipAuthentication: env.apiMocking,
  });
  return data.user;
}
export async function signOut(): Promise<void> {
  // Revoke using the refresh cookie even if access has expired. Never retry logout through refresh.
  await httpClient.post("/session/sign-out", {}, { skipAuthentication: true });
  endLocalSession();
}
