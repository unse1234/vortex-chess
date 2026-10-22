import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Translucent console panel with the emerald signal line along its top edge. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg shadow-[0_40px_80px_-24px_rgb(0_0_0/0.85)] backdrop-blur-md",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-linear-to-r from-auth-primary/25 via-auth-primary/80 to-auth-primary/25"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_45%_100%_at_50%_0%,rgb(78_222_163/0.07),transparent)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
