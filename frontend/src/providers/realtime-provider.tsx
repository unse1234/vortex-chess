"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { env } from "@/config/env";
import { sessionQueryOptions } from "@/features/auth/queries/session.queries";
import { RealtimeContext } from "@/lib/realtime/realtime-context";
import type { RealtimeClient } from "@/lib/realtime/realtime-contract";

/**
 * Owns the single realtime connection for the signed-in session. It only
 * connects once a session exists and disconnects when it ends. No production
 * transport is chosen yet, so outside mock mode there is no client and
 * features fall back to refreshing over HTTP.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  // Observes the session cache without fetching it (the shells do the fetching).
  const { data: session } = useQuery({ ...sessionQueryOptions(), enabled: false });
  const authenticated = Boolean(session);
  const [client, setClient] = useState<RealtimeClient | null>(null);

  useEffect(() => {
    if (!authenticated || !env.apiMocking) return;

    let active = true;
    let disconnect: (() => void) | undefined;
    import("@/mocks/realtime/mock-realtime-client").then(({ mockRealtimeClient }) => {
      if (!active) return;
      mockRealtimeClient.connect();
      disconnect = () => mockRealtimeClient.disconnect();
      setClient(mockRealtimeClient);
    });

    return () => {
      active = false;
      disconnect?.();
    };
  }, [authenticated]);

  return <RealtimeContext.Provider value={authenticated ? client : null}>{children}</RealtimeContext.Provider>;
}
