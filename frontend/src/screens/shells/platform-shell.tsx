import { Suspense, type ReactNode } from "react";
import { RequireSession } from "@/features/auth/components/require-session";

/** Frame for signed-in platform screens (launcher, rooms, matchmaking, history). */
export function PlatformShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas xl:h-dvh xl:flex-none xl:overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 font-semibold text-[#1b1305] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <Suspense fallback={null}>
        <RequireSession />
      </Suspense>
      {children}
    </div>
  );
}
