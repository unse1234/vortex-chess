import axios, { type InternalAxiosRequestConfig } from "axios";
import { env } from "@/config/env";
import { toApiError } from "@/lib/http/api-error";

declare module "axios" {
  interface AxiosRequestConfig {
    skipAuthentication?: boolean;
    _authRetry?: boolean;
    _authToken?: string | null;
    _authGeneration?: number;
  }
}

type AuthenticationTransport = {
  token: () => string | null;
  generation: () => number;
  refresh: () => Promise<unknown>;
  expire: () => void;
};
let authentication: AuthenticationTransport | undefined;
/** The auth feature supplies policy; generic HTTP mechanics never import domain services. */
export function configureAuthentication(transport: AuthenticationTransport) {
  authentication = transport;
}

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 10_000,
  withCredentials: true,
  headers: { Accept: "application/json", "X-Vortix-CSRF": "1" },
});
httpClient.interceptors.request.use((config) => {
  if (authentication && !config.skipAuthentication) {
    config._authGeneration = authentication.generation();
    config._authToken = authentication.token();
    if (config._authToken)
      config.headers.set("Authorization", `Bearer ${config._authToken}`);
    else config.headers.delete("Authorization");
  }
  return config;
});
function isStale(config: InternalAxiosRequestConfig) {
  return (
    authentication &&
    !config.skipAuthentication &&
    config._authGeneration !== authentication.generation()
  );
}
httpClient.interceptors.response.use(
  (response) => {
    if (isStale(response.config))
      return Promise.reject(new axios.CanceledError("Session changed"));
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config)
      return Promise.reject(toApiError(error));
    const config = error.config;
    if (isStale(config))
      return Promise.reject(new axios.CanceledError("Session changed"));
    if (
      error.response?.status !== 401 ||
      config.skipAuthentication ||
      !authentication
    )
      return Promise.reject(toApiError(error));
    if (config._authRetry) {
      authentication.expire();
      return Promise.reject(toApiError(error));
    }
    config._authRetry = true;
    try {
      // A different failed request may have already refreshed this access token.
      if (
        !authentication.token() ||
        authentication.token() === config._authToken
      )
        await authentication.refresh();
      if (isStale(config)) throw new axios.CanceledError("Session changed");
      return httpClient.request(config);
    } catch (refreshError) {
      return Promise.reject(toApiError(refreshError));
    }
  },
);
let deferredUntil: Promise<unknown> | null = null;
export function deferRequestsUntil(ready: Promise<unknown>) {
  if (deferredUntil) return;
  deferredUntil = ready;
  httpClient.interceptors.request.use(async (config) => {
    await ready;
    return config;
  });
}
