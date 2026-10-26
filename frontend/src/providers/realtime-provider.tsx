"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { isCancel } from "axios";
import { env, realtimeEndpoint } from "@/config/env";
import { sessionQueryOptions } from "@/features/auth/queries/session.queries";
import {
  getAccessToken,
  refreshSession,
} from "@/features/auth/services/auth-session.service";
import { ApiError } from "@/lib/http/api-error";
import { RealtimeContext } from "@/lib/realtime/realtime-context";
import type { RealtimeClient } from "@/lib/realtime/realtime-contract";
import {
  createSocketRealtimeClient,
  type TokenRenewal,
} from "@/lib/realtime/socket-realtime-client";

/** Session policy for the transport: refresh once, end on rejection, retry on outages. */
async function renewToken(): Promise<TokenRenewal> {
  try {
    await refreshSession();
    return "renewed";
  } catch (error) {
    if (isCancel(error) || (error instanceof ApiError && error.status === 401)) return "ended";
    return "retry";
  }
}

/**
 * Owns the single realtime connection for the signed-in account. It connects
 * once a session exists, reconnects for a different account, and disconnects
 * when the session ends. Demo mode uses the scripted in-process client.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  // Observes the session cache without fetching it (the shells do the fetching).
  const { data: session } = useQuery({ ...sessionQueryOptions(), enabled: false });
  const accountId = session?.id ?? null;
  const [client, setClient] = useState<RealtimeClient | null>(null);

  useEffect(() => {
    if (!accountId) return;

    if (env.apiMocking) {
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
        setClient(null);
      };
    }

    const socketClient = createSocketRealtimeClient({
      ...realtimeEndpoint(window.location.origin),
      getToken: getAccessToken,
      renewToken,
    });
    socketClient.connect();
    // External system synchronization: expose the connection created for this account.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClient(socketClient);
    return () => {
      socketClient.disconnect();
      setClient(null);
    };
  }, [accountId]);

  return <RealtimeContext.Provider value={accountId ? client : null}>{children}</RealtimeContext.Provider>;
}
