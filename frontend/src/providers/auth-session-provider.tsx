"use client";
import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  endLocalSession,
  onSessionEvent,
  setSessionBroadcaster,
} from "@/features/auth/services/auth-session.service";
import { replaceSessionCache } from "@/features/auth/queries/session.queries";
import { env } from "@/config/env";

/** Cache/session coordination stays above HTTP transport. */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = onSessionEvent(() => {
      void replaceSessionCache(queryClient, null);
    });
    const channel =
      !env.apiMocking && typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("vortix-auth")
        : null;
    setSessionBroadcaster((event) => channel?.postMessage(event));
    if (channel)
      channel.onmessage = (message: MessageEvent<unknown>) => {
        if (message.data === "ended" || message.data === "changed")
          endLocalSession(message.data, false);
      };
    return () => {
      unsubscribe();
      setSessionBroadcaster();
      channel?.close();
    };
  }, [queryClient]);
  return children;
}
