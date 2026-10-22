import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/** Horizontal rule with a centred caption, e.g. "AUTHENTICATE VIA SECURE PROTOCOL". */
export function AuthDivider({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="separator"
      className={cn(
        "flex items-center font-display uppercase text-auth-muted",
        className,
      )}
    >
      <span aria-hidden className="h-px flex-1 bg-auth-line" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-auth-line" />
    </div>
  );
}
