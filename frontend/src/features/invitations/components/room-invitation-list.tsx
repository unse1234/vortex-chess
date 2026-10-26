"use client";

import { Avatar } from "@/components/display/avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button } from "@/components/ui/button";
import { MailIcon } from "@/components/ui/icons";
import {
  InvitationStatusBadge,
  invitationBadgeState,
} from "@/features/invitations/components/invitation-status-badge";
import { useInvitationActions, useRoomInvitationsQuery } from "@/features/invitations/hooks/use-invitations";
import type { Invitation } from "@/features/invitations/types/invitation.types";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/utils/format-relative-time";
import { formatTimeUntil } from "@/utils/format-time-until";

/** Invitations the host has sent for this room, with cancellation of pending ones. */
export function RoomInvitationList({ roomId, enabled }: { roomId: string; enabled: boolean }) {
  const query = useRoomInvitationsQuery(roomId, enabled);
  const now = useNow();

  if (query.isPending)
    return (
      <div className="flex flex-col gap-2" aria-label="Loading invitations">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <ErrorState
        title="Couldn't load invitations"
        message={query.error.message}
        onRetry={() => query.refetch()}
        retrying={query.isRefetching}
      />
    );
  if (query.data.length === 0)
    return <EmptyState icon={<MailIcon />} title="No invitations yet" description="Invite a registered player by username or email." />;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {query.data.map((invitation) => (
        <li key={invitation.id}>
          <InvitationRow invitation={invitation} now={now} />
        </li>
      ))}
    </ul>
  );
}

function InvitationRow({ invitation, now }: { invitation: Invitation; now: number | null }) {
  const { cancel } = useInvitationActions(invitation.id);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Avatar src={invitation.recipient.avatarUrl} name={invitation.recipient.username} size={34} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[14px] font-semibold text-fg">
          {invitation.recipient.username}
          <InvitationStatusBadge state={invitationBadgeState(invitation)} />
        </p>
        <p className="text-[12px] text-fg-subtle">
          {now === null
            ? " "
            : invitation.status === "pending"
              ? `Sent ${formatRelativeTime(invitation.createdAt, now)} · expires ${formatTimeUntil(invitation.expiresAt, now)}`
              : `Sent ${formatRelativeTime(invitation.createdAt, now)}`}
        </p>
        {cancel.isError ? <p role="alert" className="text-[12px] text-danger">{cancel.error.message}</p> : null}
      </div>
      {invitation.viewer.canCancel ? (
        <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          {cancel.isPending ? "Cancelling…" : "Cancel"}
        </Button>
      ) : null}
    </div>
  );
}
