"use client";

import { IconButton } from "@/components/ui/button";
import {
  WifiFairIcon,
  WifiOffIcon,
  WifiStrongIcon,
  WifiWeakIcon,
} from "@/components/ui/icons";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/utils/cn";

type ConnectionStatusProps = {
  state: "checking" | "connected" | "unreachable";
  latencyMs?: number;
  region?: string;
  /** Whether responses come from development mocks rather than a real API. */
  mocked: boolean;
};

function describeQuality(latencyMs: number) {
  if (latencyMs <= 80) return { label: "Excellent", tone: "text-success", Icon: WifiStrongIcon };
  if (latencyMs <= 180) return { label: "Fair", tone: "text-accent", Icon: WifiFairIcon };
  return { label: "Slow", tone: "text-danger", Icon: WifiWeakIcon };
}

export function ConnectionStatus({ state, latencyMs, region, mocked }: ConnectionStatusProps) {
  const quality =
    state === "connected" && latencyMs !== undefined ? describeQuality(latencyMs) : null;
  const Icon = quality?.Icon ?? (state === "checking" ? WifiFairIcon : WifiOffIcon);
  const tone = quality?.tone ?? (state === "checking" ? "text-fg-subtle animate-pulse" : "text-danger");
  const summary = quality
    ? `${quality.label} connection, ${latencyMs} ms`
    : state === "checking"
      ? "Checking connection"
      : "Server unreachable";

  return (
    <Popover
      label="Connection status"
      trigger={(props) => (
        <IconButton
          {...props}
          label={`Connection: ${summary}`}
          icon={<Icon />}
          className={cn(tone, "hover:text-current")}
        />
      )}
    >
      <p className="text-sm font-semibold text-fg">Connection</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-fg-muted">Status</dt>
        <dd className={cn("text-right font-medium", quality?.tone ?? "text-fg")}>
          {quality?.label ?? (state === "checking" ? "Checking…" : "Unreachable")}
        </dd>
        <dt className="text-fg-muted">API round trip</dt>
        <dd className="text-right font-medium text-fg">
          {latencyMs !== undefined ? `${latencyMs} ms` : "—"}
        </dd>
        <dt className="text-fg-muted">Region</dt>
        <dd className="text-right font-medium text-fg">{region ?? "—"}</dd>
      </dl>
      {mocked ? (
        <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-[12px] leading-snug text-accent">
          Preview mode: responses come from a local mock API, not a game server.
        </p>
      ) : null}
    </Popover>
  );
}
