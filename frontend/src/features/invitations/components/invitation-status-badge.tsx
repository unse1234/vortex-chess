import type { Invitation } from "@/features/invitations/types/invitation.types";
import { cn } from "@/utils/cn";

type BadgeState = Invitation["status"] | "full";

const styles: Record<BadgeState, { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-accent-line bg-accent-soft text-accent" },
  accepted: { label: "Accepted", className: "border-success-line bg-success-soft text-success" },
  declined: { label: "Declined", className: "border-danger-line bg-danger-soft text-danger" },
  cancelled: { label: "Cancelled", className: "border-line-strong bg-surface-raised text-fg-muted" },
  expired: { label: "Expired", className: "border-line-strong bg-surface-raised text-fg-muted" },
  full: { label: "Room full", className: "border-info-line bg-info-soft text-info" },
};

/** Pending invitations to a room whose seat is taken are shown as full. */
export function invitationBadgeState(invitation: Pick<Invitation, "status" | "room">): BadgeState {
  return invitation.status === "pending" && invitation.room.availability === "full" ? "full" : invitation.status;
}

export function InvitationStatusBadge({ state, className }: { state: BadgeState; className?: string }) {
  const style = styles[state];
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em]", style.className, className)}>
      {style.label}
    </span>
  );
}
