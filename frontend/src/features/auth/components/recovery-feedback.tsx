import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

const alertTones = {
  danger: "border-auth-danger/40 bg-auth-danger/10 text-auth-danger",
  success: "border-auth-primary/40 bg-auth-primary/10 text-auth-text",
  info: "border-auth-amber/40 bg-auth-amber/10 text-auth-text",
} as const;

/** Inline status for the recovery forms; errors are announced to assistive tech. */
export function RecoveryAlert({
  tone,
  icon,
  className,
  children,
}: {
  tone: keyof typeof alertTones;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-[4px] border px-3 py-2 text-left font-body text-[14px] leading-[20px]",
        alertTones[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden className="mt-px shrink-0 text-[20px]">{icon}</span> : null}
      <span>{children}</span>
    </p>
  );
}

export function recoveryButtonClass(kind: "primary" | "secondary", className?: string) {
  return cn(
    "flex items-center justify-center gap-[14px] rounded-[4px] font-display font-bold uppercase transition-[filter,opacity] disabled:cursor-wait disabled:opacity-75",
    kind === "primary"
      ? "h-[60px] w-full bg-auth-primary text-[15px] tracking-[0.08em] text-auth-on-primary hover:brightness-110 sm:text-[18px]"
      : "h-[46px] px-5 text-[13px] tracking-[0.06em] text-auth-primary ring-1 ring-auth-primary/50 hover:bg-auth-primary/10",
    className,
  );
}

export function recoveryLinkClass(className?: string) {
  return cn(
    "mx-auto block w-fit font-display text-[13px] font-medium uppercase tracking-[0.06em] text-auth-primary hover:underline",
    className,
  );
}
