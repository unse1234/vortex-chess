"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type {
  RealtimeClient,
  RealtimeConnectionStatus,
} from "@/lib/realtime/realtime-contract";

/** `null` while no transport is configured or the player is signed out. */
export const RealtimeContext = createContext<RealtimeClient | null>(null);

export function useRealtimeClient() {
  return useContext(RealtimeContext);
}

/** Connection status of the shared transport; "idle" when there isn't one. */
export function useRealtimeStatus(client: RealtimeClient | null): RealtimeConnectionStatus {
  return useSyncExternalStore(
    (onChange) => client?.onStatusChange(onChange) ?? (() => {}),
    () => client?.getStatus() ?? "idle",
    () => "idle",
  );
}
