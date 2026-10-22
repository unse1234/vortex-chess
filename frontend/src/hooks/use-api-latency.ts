"use client";

import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@/hooks/use-hydrated";
import { pingApi } from "@/lib/http/ping";

const PING_INTERVAL_MS = 30_000;

/** Periodically measured round trip to the API, used for connection status. */
export function useApiLatency() {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: ["system", "latency"],
    queryFn: pingApi,
    refetchInterval: PING_INTERVAL_MS,
    staleTime: 0,
    retry: false,
  });
  return hydrated
    ? query
    : {
        ...query,
        data: undefined,
        error: null,
        isPending: true as const,
        isError: false as const,
        isSuccess: false as const,
        status: "pending" as const,
      };
}
