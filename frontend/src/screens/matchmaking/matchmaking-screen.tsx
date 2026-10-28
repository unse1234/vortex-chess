"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { useMatchmaking } from "@/features/matchmaking/hooks/use-matchmaking";
import { TimeControlPicker } from "@/features/rooms/components/time-control-picker";
import { useSearchTime } from "@/features/matchmaking/hooks/use-search-time";
import { useBrowserOnline } from "@/hooks/use-browser-online";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";

const reasons: Record<string, string> = {
  cancelled: "Search cancelled.", opponent_cancelled: "Your opponent cancelled. You can search again.",
  search_expired: "Your search expired after five minutes. You can search again.",
  arrival_expired: "Both players did not arrive within 30 seconds. You can search again.",
};

export function MatchmakingScreen() {
  const { data: session } = useSessionQuery();
  const { query, options, join, cancel } = useMatchmaking(session?.id ?? "");
  const realtime = useRealtimeClient();
  const connection = useRealtimeStatus(realtime);
  const online = useBrowserOnline();
  const [selected, setSelected] = useState<string | null>(null);
  const status = query.data;
  const waiting = status?.state === "searching" || status?.state === "confirming";
  const selectedId = waiting ? options.data?.timeControls.find((preset) => preset.initialMs === status.timeControl?.initialMs
    && preset.incrementMs === status.timeControl?.incrementMs)?.id ?? "" : selected ?? options.data?.defaultTimeControlId ?? "";
  const preset = options.data?.timeControls.find((item) => item.id === selectedId);
  const busy = join.isPending || cancel.isPending || status?.state === "matched";
  const error = join.error ?? cancel.error ?? query.error ?? options.error;
  const disconnected = !online || connection !== "connected";
  const elapsed = useSearchTime(status?.queuedAt ?? null);

  return (
    <main id="main-content" className="flex-1 overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-line-strong bg-surface p-6 sm:p-8">
        <Link href={routes.play} className="text-sm text-accent hover:underline">Back to lobby</Link>
        <h1 className="mt-5 text-3xl font-bold text-fg">Play Online</h1>
        <p className="mt-2 text-fg-muted">Find a human opponent for a casual, unrated game with exactly the same time control. Colors are assigned by the server.</p>
        <div className="mt-7">
          {options.data ? <TimeControlPicker name="matchmaking-time" presets={options.data.timeControls}
            value={selectedId} onChange={setSelected} disabled={waiting || busy} /> : <p className="text-fg-muted">Loading time controls...</p>}
        </div>
        <div className="mt-7 space-y-3" role="status" aria-live="polite">
          {disconnected ? <p className="text-fg-muted">{online
            ? "Disconnected from realtime. Checking search status over HTTP; reconnecting automatically."
            : "You are offline. Your search remains saved; status checks resume when your network returns."}</p> : null}
          {status?.state === "matched" ? <p className="font-semibold text-accent">Match found. Opening your game...</p>
            : cancel.isPending ? <p className="text-fg">Cancelling search...</p>
            : waiting ? <>
              <p className="font-semibold text-fg">{status.state === "confirming" ? "Opponent found. Confirming both players..." : "Searching for an opponent..."}</p>
              <p className="font-mono text-fg-muted">Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>
            </> : <p className="text-fg-muted">{status?.reason ? reasons[status.reason] ?? "Ready to search." : "Choose a time control, then find a match."}</p>}
          {error ? <p role="alert" className="text-danger">{error.message}</p> : null}
          {options.data?.enabled === false ? <p className="text-fg-muted">Online matchmaking is currently unavailable on this server.</p> : null}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {waiting ? <Button variant="danger" disabled={cancel.isPending} onClick={() => {
            join.reset(); if (status.searchId) cancel.mutate(status.searchId);
          }}>{cancel.isPending ? "Cancelling..." : "Cancel Search"}</Button>
            : <Button variant="primary" disabled={!online || !preset || !status || !options.data?.enabled || busy || query.isError} onClick={() => {
              cancel.reset(); if (preset) join.mutate({ initialMs: preset.initialMs, incrementMs: preset.incrementMs });
            }}>{join.isPending ? "Joining..." : "Find Match"}</Button>}
          {error ? <Button onClick={() => { join.reset(); cancel.reset(); void query.refetch(); void options.refetch(); }}>Retry status</Button> : null}
        </div>
        <p className="mt-6 text-sm text-fg-subtle">Searches last five minutes. Keep a tab open: both players must confirm automatically within 30 seconds. Clocks start once both confirm. Closing a tab does not cancel your search.</p>
      </div>
    </main>
  );
}
