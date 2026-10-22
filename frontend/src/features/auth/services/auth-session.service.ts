import { env } from "@/config/env";
import { CanceledError } from "axios";
import { configureAuthentication, httpClient } from "@/lib/http/browser-client";
import { ApiError } from "@/lib/http/api-error";
import type { AuthResponse } from "@/features/auth/types/session.types";

type SessionEvent = "ended" | "changed";
let accessToken: string | null = null;
let generation = 0;
let refreshInFlight: Promise<AuthResponse> | null = null;
const listeners = new Set<(event: SessionEvent) => void>();
let broadcast: ((event: SessionEvent) => void) | undefined;
export const getAccessToken = () => accessToken;
export function onSessionEvent(listener: (event: SessionEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setSessionBroadcaster(
  callback?: (event: SessionEvent) => void,
) {
  broadcast = callback;
}
export function endLocalSession(
  event: SessionEvent = "ended",
  notifyOtherTabs = true,
) {
  accessToken = null;
  generation += 1;
  for (const listener of listeners) listener(event);
  if (notifyOtherTabs) broadcast?.(event);
}

/** Credentials/tokens are never written to storage or sent through BroadcastChannel. */
export async function establishSession(path: string, request: unknown) {
  const currentGeneration = ++generation;
  accessToken = null;
  const { data } = await httpClient.post<AuthResponse>(path, request, {
    skipAuthentication: true,
  });
  if (generation !== currentGeneration)
    throw new CanceledError("Session changed");
  accessToken = data.accessToken;
  broadcast?.("changed");
  return data.user;
}

export function refreshSession(): Promise<AuthResponse> {
  if (refreshInFlight) return refreshInFlight;
  const currentGeneration = generation;
  const execute = async () => {
    // Requests waiting for another tab's refresh read the newest shared cookie.
    if (generation !== currentGeneration)
      throw new CanceledError("Session changed");
    try {
      const { data } = await httpClient.post<AuthResponse>(
        "/auth/refresh",
        {},
        { skipAuthentication: true },
      );
      if (generation !== currentGeneration)
        throw new CanceledError("Session changed");
      accessToken = data.accessToken;
      return data;
    } catch (error) {
      if (
        generation === currentGeneration &&
        error instanceof ApiError &&
        error.status === 401
      )
        endLocalSession();
      throw error;
    }
  };
  const operation = (async () => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request("vortix-auth-refresh", execute);
    return execute();
  })();
  const promise = operation.finally(() => {
    if (refreshInFlight === promise) refreshInFlight = null;
  });
  refreshInFlight = promise;
  return promise;
}
if (!env.apiMocking)
  configureAuthentication({
    token: getAccessToken,
    generation: () => generation,
    refresh: refreshSession,
    expire: endLocalSession,
  });
