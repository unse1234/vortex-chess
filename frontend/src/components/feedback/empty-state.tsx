import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-4 py-6 text-center", className)}>
      {icon ? (
        <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-raised text-2xl text-fg-subtle">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-xs text-[13px] leading-snug text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
