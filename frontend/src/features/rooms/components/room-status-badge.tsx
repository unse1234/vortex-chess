import type { RoomStatus } from "@/features/rooms/types/room.types";
import { cn } from "@/utils/cn";

const styles: Record<RoomStatus, { label: string; className: string }> = {
  waiting: { label: "Waiting", className: "border-info-line bg-info-soft text-info" },
  ready: { label: "Both ready", className: "border-success-line bg-success-soft text-success" },
  started: { label: "Game started", className: "border-accent-line bg-accent-soft text-accent" },
  cancelled: { label: "Cancelled", className: "border-danger-line bg-danger-soft text-danger" },
  expired: { label: "Expired", className: "border-line-strong bg-surface-raised text-fg-muted" },
};

export function RoomStatusBadge({ status, className }: { status: RoomStatus; className?: string }) {
  const style = styles[status];
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em]", style.className, className)}>
      {style.label}
    </span>
  );
}
