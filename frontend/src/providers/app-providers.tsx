"use client";

import { Suspense, type ReactNode } from "react";
import { ToastProvider } from "@/components/feedback/toast";
import { AuthSessionProvider } from "@/providers/auth-session-provider";
import { MockProvider } from "@/providers/mock-provider";
import { QueryProvider } from "@/providers/query-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { SessionRealtimeBridge } from "@/providers/session-realtime-bridge";
import { MatchmakingBridge } from "@/providers/matchmaking-bridge";
import { AudioProvider } from "@/features/audio/audio-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MockProvider>
      <QueryProvider>
        <AuthSessionProvider>
          <RealtimeProvider>
            <AudioProvider>
              <ToastProvider>
                <SessionRealtimeBridge />
                <Suspense fallback={null}><MatchmakingBridge /></Suspense>
                {children}
              </ToastProvider>
            </AudioProvider>
          </RealtimeProvider>
        </AuthSessionProvider>
      </QueryProvider>
    </MockProvider>
  );
}
