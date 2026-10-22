import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { AccountSummary } from "@/features/auth/types/session.types";
import { getSession } from "@/features/auth/services/session.service";

export const sessionKeys = {
  current: ["session", "current"] as const,
};

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionKeys.current,
    queryFn: getSession,
    staleTime: 5 * 60_000,
  });
}

/** Keep the observed session query alive so mounted guards receive identity changes. */
export async function replaceSessionCache(
  queryClient: QueryClient,
  account: AccountSummary | null,
) {
  await queryClient.cancelQueries();
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[0] !== "session" || query.queryKey[1] !== "current",
  });
  queryClient.getMutationCache().clear();
  queryClient.setQueryData(sessionKeys.current, account);
}
