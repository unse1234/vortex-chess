"use client";

import { useApiLatency } from "@/hooks/use-api-latency";
import { cn } from "@/utils/cn";

const DEGRADED_LATENCY_MS = 300;

/** Live API reachability for the auth header, e.g. "NET: OPERATIONAL". */
export function AuthNetworkStatus() {
  const latency = useApiLatency();

  const status = latency.isPending
    ? { label: "CONNECTING", dot: "bg-auth-muted animate-pulse" }
    : latency.isError
      ? { label: "OFFLINE", dot: "bg-auth-danger" }
      : latency.data.latencyMs > DEGRADED_LATENCY_MS
        ? { label: "DEGRADED", dot: "bg-auth-amber" }
        : { label: "OPERATIONAL", dot: "bg-auth-primary" };

  return (
    <div className="flex items-center gap-[21px]">
      <p className="flex items-center gap-[6px] whitespace-nowrap font-mono text-[11px] font-bold tracking-[0.12em] text-[#cbdbcf] sm:text-[13px] sm:tracking-[0.22em]">
        <span aria-hidden className={cn("size-[6px] rounded-full", status.dot)} />
        <span>
          NET: {status.label}
        </span>
      </p>
      {latency.data ? (
        <p className="hidden font-display text-[13px] tracking-[0.065em] text-[#8e9d92] sm:block">
          RELAY {"// "}
          {latency.data.region}
        </p>
      ) : null}
    </div>
  );
}
