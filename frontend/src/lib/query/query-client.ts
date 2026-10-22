import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";

const MAX_RETRIES = 2;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES &&
          (!(error instanceof ApiError) || error.retryable),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Returns a fresh client for every server render and one stable client in the
 * browser, so user data is never shared across requests.
 */
export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
