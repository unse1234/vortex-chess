import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type PanelProps = {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Busy state for assistive technology while the panel's content loads. */
  busy?: boolean;
};

/** Titled content frame used by launcher panels. */
export function Panel({ title, icon, action, children, className, busy }: PanelProps) {
  return (
    <section
      aria-label={title}
      aria-busy={busy || undefined}
      className={cn(
        "flex flex-col rounded-lg border border-line bg-surface/95 px-4 pb-4 pt-3 shadow-panel backdrop-blur-sm sm:px-[18px]",
        className,
      )}
    >
      <header className="flex min-h-11 items-center gap-2.5 border-b border-line pb-3">
        <span className="text-xl text-accent">{icon}</span>
        <h2 className="flex-1 text-[15px] font-bold uppercase tracking-[0.08em] text-accent">{title}</h2>
        {action}
      </header>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}
