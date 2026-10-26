"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/feedback/toast";
import { AuthSessionProvider } from "@/providers/auth-session-provider";
import { MockProvider } from "@/providers/mock-provider";
import { QueryProvider } from "@/providers/query-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { SessionRealtimeBridge } from "@/providers/session-realtime-bridge";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MockProvider>
      <QueryProvider>
        <AuthSessionProvider>
          <RealtimeProvider>
            <ToastProvider>
              <SessionRealtimeBridge />
              {children}
            </ToastProvider>
          </RealtimeProvider>
        </AuthSessionProvider>
      </QueryProvider>
    </MockProvider>
  );
}
