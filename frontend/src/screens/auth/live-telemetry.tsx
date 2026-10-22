"use client";

import { useApiLatency } from "@/hooks/use-api-latency";

/** Measured API round trip, e.g. "LATENCY: 12MS". */
export function LatencyReading() {
  const { data } = useApiLatency();
  return <>LATENCY: {data ? `${data.latencyMs}MS` : "--MS"}</>;
}

/** API reachability tag, e.g. "[ONLINE]". */
export function ReachabilityTag() {
  const { isPending, isError } = useApiLatency();
  return <>[{isPending ? "CHECKING" : isError ? "OFFLINE" : "ONLINE"}]</>;
}
