import type { ReactNode } from "react";
import { Avatar } from "@/components/display/avatar";
import { CheckCircleIcon, ChessKingIcon } from "@/components/ui/icons";
import type { RoomSeat } from "@/features/rooms/types/room.types";
import { cn } from "@/utils/cn";

type RoomSeatCardProps = {
  label: "Host" | "Challenger";
  seat: RoomSeat | null;
  isViewer: boolean;
  /** Shown in an empty seat, e.g. the host's invitation form. */
  emptyContent?: ReactNode;
};

export function RoomSeatCard({ label, seat, isViewer, emptyContent }: RoomSeatCardProps) {
  if (!seat) {
    return (
      <section
        aria-label={`${label} seat`}
        className="flex min-h-[188px] flex-col rounded-lg border border-dashed border-line-strong bg-surface/70 p-4"
      >
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-fg-subtle">{label}</p>
        <p className="mt-2 text-[15px] font-semibold text-fg-muted">Waiting for a challenger</p>
        {emptyContent ? <div className="mt-3">{emptyContent}</div> : null}
      </section>
    );
  }
  return (
    <section
      aria-label={`${label} seat`}
      className={cn(
        "flex min-h-[188px] flex-col rounded-lg border bg-surface/95 p-4 shadow-panel",
        seat.ready ? "border-success-line" : "border-line",
      )}
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-fg-subtle">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        <Avatar src={seat.player.avatarUrl} name={seat.player.username} size={52} presence={seat.online ? "online" : "offline"} className="[&>span:last-child]:ring-surface" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold text-fg">
            {seat.player.username}
            {isViewer ? <span className="ml-1.5 text-[13px] font-medium text-fg-muted">(you)</span> : null}
          </p>
          <p className={cn("text-[13px]", seat.online ? "text-success" : "text-fg-subtle")}>
            {seat.online ? "Online" : "Offline"}
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4 text-[13px]">
        <span className="inline-flex items-center gap-1.5 rounded border border-line-strong px-2 py-0.5 text-fg-muted">
          <ChessKingIcon aria-hidden className={cn("text-base", seat.color === "black" ? "text-[#8a93a6]" : "text-white")} />
          {seat.color === "white" ? "White" : seat.color === "black" ? "Black" : "Random colour"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold",
            seat.ready ? "bg-success-soft text-success" : "bg-surface-raised text-fg-muted",
          )}
        >
          {seat.ready ? <CheckCircleIcon aria-hidden className="text-base" /> : null}
          {seat.ready ? "Ready" : "Not ready"}
        </span>
      </div>
    </section>
  );
}
