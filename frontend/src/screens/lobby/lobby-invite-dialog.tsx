"use client";

import { routes } from "@/config/routes";
import { InviteFriendsDialog } from "@/features/social/components/invite-friends-dialog";
import { useNavigateOrPreview } from "@/hooks/use-navigate-or-preview";
import { useLobbyInteractions } from "@/screens/lobby/lobby-interactions";

/** Connects the social invite picker to room creation. */
export function LobbyInviteDialog() {
  const { inviteFriendIds, closeInvite } = useLobbyInteractions();
  const { navigate } = useNavigateOrPreview();

  return (
    <InviteFriendsDialog
      open={inviteFriendIds !== null}
      onOpenChange={(open) => {
        if (!open) closeInvite();
      }}
      initialSelectedIds={inviteFriendIds ?? []}
      onConfirm={(friendIds) => {
        closeInvite();
        navigate(routes.createRoom({ invite: friendIds }));
      }}
    />
  );
}
