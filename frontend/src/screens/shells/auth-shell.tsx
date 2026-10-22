import type { ReactNode } from "react";
import { authTelemetry } from "@/screens/auth/auth-telemetry";
import { AuthNetworkStatus } from "@/screens/shells/auth-network-status";
import { cn } from "@/utils/cn";

/** Frame for sign-in, sign-up and recovery: console header, centred content, footer. */
export function AuthShell({ children, className }: { children: ReactNode; className?: string }) {
  const { footer } = authTelemetry;

  return (
    <div className={cn("flex min-h-dvh flex-1 flex-col bg-auth-page font-body text-auth-text", className)}>
      <header className="flex h-[70px] shrink-0 items-center justify-between gap-4 pl-[19px] pr-5">
        <p className="flex items-center gap-[9px] whitespace-nowrap font-display text-[14px] font-medium tracking-[0.03em] text-auth-primary sm:gap-[11px] sm:text-[20px] sm:tracking-[0.045em]">
          <span aria-hidden className="size-3 rounded-full bg-auth-primary shadow-[0_0_10px_rgb(78_222_163/0.6)]" />
          VORTEX TACTICAL CORE
        </p>
        <AuthNetworkStatus />
      </header>

      <main id="main-content" className="flex flex-1 flex-col justify-center py-[30px]">
        {children}
      </main>

      <footer className="flex min-h-[60px] shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-3 font-display text-[12px] sm:h-[60px] sm:justify-between sm:py-0 sm:text-[13px]">
        <p className="flex gap-[15px] tracking-[0.07em] text-auth-muted">
          <span>{footer.node}</span>
          <span className="hidden sm:inline">{footer.transport}</span>
        </p>
        <p className="text-auth-label">{footer.copyright}</p>
      </footer>
    </div>
  );
}
