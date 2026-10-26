"use client";

import type { ReactNode } from "react";
import { Avatar } from "@/components/display/avatar";
import { Button } from "@/components/ui/button";
import { ChessKingIcon, ClockIcon } from "@/components/ui/icons";
import {
  InvitationStatusBadge,
  invitationBadgeState,
} from "@/features/invitations/components/invitation-status-badge";
import { useInvitationActions } from "@/features/invitations/hooks/use-invitations";
import type { Invitation } from "@/features/invitations/types/invitation.types";
import { useNow } from "@/hooks/use-now";
import { formatTimeControl } from "@/utils/format-time-control";
import { formatTimeUntil } from "@/utils/format-time-until";

const hostColor = { white: "Host plays White", black: "Host plays Black", random: "Colours assigned at random" } as const;

function outcome(invitation: Invitation): { tone: "info" | "success" | "muted" | "danger"; text: string } | null {
  const mine = invitation.viewer.role === "recipient";
  switch (invitation.status) {
    case "accepted":
      return { tone: "success", text: mine ? "You accepted this invitation." : `${invitation.recipient.username} accepted.` };
    case "declined":
      return { tone: "muted", text: mine ? "You declined this invitation." : `${invitation.recipient.username} declined.` };
    case "cancelled":
      return { tone: "muted", text: mine ? "The host cancelled this invitation." : "You cancelled this invitation." };
    case "expired":
      return { tone: "muted", text: "This invitation has expired." };
  }
  if (invitation.room.availability === "closed")
    return { tone: "muted", text: "This room is no longer available." };
  if (invitation.room.availability === "full")
    return { tone: "info", text: "Another player has already taken the challenger seat." };
  return null;
}

const toneClass = {
  info: "border-info-line bg-info-soft text-info",
  success: "border-success-line bg-success-soft text-success",
  muted: "border-line-strong bg-surface-raised text-fg-muted",
  danger: "border-danger-line bg-danger-soft text-danger",
};

type InvitationResponseCardProps = {
  invitation: Invitation;
  /** Navigation stays with the screen; acceptance only resolves the seat. */
  onOpenRoom: (roomId: string) => void;
};

export function InvitationResponseCard({ invitation, onOpenRoom }: InvitationResponseCardProps) {
  const { accept, decline, cancel } = useInvitationActions(invitation.id);
  const now = useNow();
  const state = outcome(invitation);
  const actionError = accept.error ?? decline.error ?? cancel.error;
  const pending = accept.isPending || decline.isPending || cancel.isPending;
  const counterpart = invitation.viewer.role === "recipient" ? invitation.sender : invitation.recipient;
  const canOpenRoom =
    invitation.room.availability !== "closed" &&
    (invitation.viewer.role === "sender" || invitation.room.availability === "joined");

  return (
    <article className="w-full max-w-lg rounded-lg border border-line-strong bg-surface/95 p-6 shadow-panel">
      <header className="flex items-start gap-4">
        <Avatar src={counterpart.avatarUrl} name={counterpart.username} size={56} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-accent">Private game invitation</p>
          <h1 className="mt-1 text-xl font-bold text-fg">
            {invitation.viewer.role === "recipient"
              ? `${invitation.sender.username} invited you to play`
              : `You invited ${invitation.recipient.username}`}
          </h1>
        </div>
        <InvitationStatusBadge state={invitationBadgeState(invitation)} />
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-[14px]">
        <Detail icon={<ClockIcon />} label="Time control" value={formatTimeControl(invitation.room.timeControl)} />
        <Detail icon={<ChessKingIcon />} label="Colours" value={hostColor[invitation.room.colorPreference]} />
      </dl>
      {invitation.status === "pending" && now !== null ? (
        <p className="mt-3 text-[13px] text-fg-muted">Expires {formatTimeUntil(invitation.expiresAt, now)}</p>
      ) : null}

      {state ? (
        <p role="status" className={`mt-5 rounded-md border px-3 py-2 text-[14px] ${toneClass[state.tone]}`}>
          {state.text}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className={`mt-3 rounded-md border px-3 py-2 text-[14px] ${toneClass.danger}`}>
          {actionError.message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {invitation.viewer.canDecline ? (
          <Button variant="ghost" onClick={() => decline.mutate()} disabled={pending}>
            {decline.isPending ? "Declining…" : "Decline"}
          </Button>
        ) : null}
        {invitation.viewer.canCancel ? (
          <Button variant="danger" onClick={() => cancel.mutate()} disabled={pending}>
            {cancel.isPending ? "Cancelling…" : "Cancel invitation"}
          </Button>
        ) : null}
        {invitation.viewer.canAccept ? (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => accept.mutate(undefined, { onSuccess: (accepted) => onOpenRoom(accepted.room.id) })}
          >
            {accept.isPending ? "Joining…" : "Accept and join room"}
          </Button>
        ) : null}
        {canOpenRoom && !invitation.viewer.canAccept ? (
          <Button variant="secondary" onClick={() => onOpenRoom(invitation.room.id)}>
            Open room
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-raised px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
        <span aria-hidden className="text-base text-accent">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-fg">{value}</dd>
    </div>
  );
}
