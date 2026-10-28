import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { matchmakingStatusOptions } from "@/features/matchmaking/queries/matchmaking.queries";
import { reconcileMatchmaking, subscribeMatchmaking } from "@/features/matchmaking/realtime/matchmaking-events";
import type { MatchmakingStatus } from "@/features/matchmaking/types/matchmaking.types";
import type { RealtimeClient, RealtimeEvent } from "@/lib/realtime/realtime-contract";

const snapshot = (revision: number, state: MatchmakingStatus["state"] = "searching"): MatchmakingStatus => ({
  revision, state, rated: false, ratingPool: null, searchId: "search", timeControl: { initialMs: 180000, incrementMs: 2000 },
  queuedAt: new Date(0).toISOString(), expiresAt: new Date(300000).toISOString(), ready: false,
  gameId: state === "matched" ? "game" : null, reason: null, serverTime: 0,
});

describe("matchmaking synchronization", () => {
  it("keeps the newest state across duplicate, out-of-order and late mutation responses", () => {
    const matched = snapshot(6, "matched");
    expect(reconcileMatchmaking(matched, snapshot(5))).toBe(matched);
    expect(reconcileMatchmaking(matched, { ...matched })).toBe(matched);
    expect(reconcileMatchmaking(snapshot(7, "idle"), matched).state).toBe("idle");
    expect(reconcileMatchmaking(undefined, matched)).toBe(matched);
  });

  it("also rejects an older HTTP response that finishes after a match assignment", async () => {
    const client = new QueryClient();
    let finish!: (value: MatchmakingStatus) => void;
    const options = matchmakingStatusOptions("account");
    const fetch = client.fetchQuery({ ...options, queryFn: () => new Promise<MatchmakingStatus>((resolve) => { finish = resolve; }) });
    client.setQueryData(options.queryKey, snapshot(6, "matched"));
    finish(snapshot(4)); await fetch;
    expect(client.getQueryData<MatchmakingStatus>(options.queryKey)?.state).toBe("matched");
    client.clear();
  });

  it("subscribes to the personal channel, ignores unrelated events and cleans up on remount", () => {
    const listeners = new Set<(event: RealtimeEvent) => void>();
    const subscribe = vi.fn((_channel: string, listener: (event: RealtimeEvent) => void) => {
      listeners.add(listener); return () => { listeners.delete(listener); };
    });
    const client = { subscribe } as unknown as RealtimeClient;
    const refresh = vi.fn();
    const first = subscribeMatchmaking(client, refresh);
    expect(subscribe.mock.calls[0][0]).toBe("user");
    first();
    const second = subscribeMatchmaking(client, refresh);
    expect(listeners.size).toBe(1);
    for (const type of ["room.updated", "matchmaking.status", "matchmaking.found"])
      for (const listener of listeners) listener({ channel: "user", type, payload: {} });
    expect(refresh).toHaveBeenCalledTimes(2);
    second(); expect(listeners.size).toBe(0);
  });
});
