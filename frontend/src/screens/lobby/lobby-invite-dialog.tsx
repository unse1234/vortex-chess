"use client";

import { routes } from "@/config/routes";
import { InvitePlayerDialog } from "@/features/invitations/components/invite-player-dialog";
import { useNavigateOrPreview } from "@/hooks/use-navigate-or-preview";
import { useLobbyInteractions } from "@/screens/lobby/lobby-interactions";

/** Connects the invitation picker to room creation. */
export function LobbyInviteDialog() {
  const { inviteRecipient, closeInvite } = useLobbyInteractions();
  const { navigate } = useNavigateOrPreview();

  return (
    <InvitePlayerDialog
      open={inviteRecipient !== null}
      onOpenChange={(open) => {
        if (!open) closeInvite();
      }}
      initialRecipient={inviteRecipient ?? ""}
      onContinue={(recipient) => {
        closeInvite();
        navigate(routes.createRoom({ invite: recipient }));
      }}
    />
  );
}
