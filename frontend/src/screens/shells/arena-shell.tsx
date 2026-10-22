import { Suspense, type ReactNode } from "react";
import { RequireSession } from "@/features/auth/components/require-session";
import { ArenaHeader } from "@/screens/shells/arena-header";
import { ArenaLeaveGuardProvider } from "@/screens/shells/arena-leave-guard";
import { cn } from "@/utils/cn";

/**
 * Frame for live and archived games. It gives the board more room than the
 * lobby shell and retints the shared accent (focus rings, primary buttons) to
 * the arena's emerald.
 */
export function ArenaShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ArenaLeaveGuardProvider>
      <div
        className={cn(
          "flex min-h-dvh flex-1 flex-col bg-auth-page font-body text-auth-text [--vc-accent-strong:#6ff2bc] [--vc-accent:#4edea3] xl:h-dvh xl:min-h-[860px] xl:flex-none xl:overflow-hidden",
          className,
        )}
      >
        <a
          href="#main-content"
          className="sr-only z-50 rounded-md bg-auth-primary px-4 py-2 font-semibold text-auth-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        <Suspense fallback={null}>
          <RequireSession />
        </Suspense>
        <ArenaHeader />
        {children}
      </div>
    </ArenaLeaveGuardProvider>
  );
}
