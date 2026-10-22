"use client";

import { Dialog } from "@/components/ui/dialog";
import { SocialSidebar } from "@/features/social/components/social-sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  LOBBY_FRIEND_SEARCH_ID,
  useLobbyInteractions,
} from "@/screens/lobby/lobby-interactions";

/** Social sidebar on wide screens; a drawer opened from the header elsewhere. */
export function LobbySocialPanel() {
  const { openInvite, socialDrawerOpen, setSocialDrawerOpen } = useLobbyInteractions();
  const isDesktop = useMediaQuery("(min-width: 1280px)");

  return (
    <>
      <aside
        aria-label="Friends and chat"
        className="hidden w-(--vc-sidebar-width) shrink-0 flex-col border-l border-[#161b26] bg-sidebar xl:flex"
      >
        <SocialSidebar
          idPrefix="social-sidebar"
          onInviteFriend={(friend) => openInvite([friend.id])}
          searchInputId={LOBBY_FRIEND_SEARCH_ID}
          className="flex-1"
        />
      </aside>

      <Dialog
        open={socialDrawerOpen && !isDesktop}
        onOpenChange={setSocialDrawerOpen}
        title="Friends and chat"
        placement="end"
        className="bg-sidebar"
      >
        <SocialSidebar
          idPrefix="social-drawer"
          onInviteFriend={(friend) => {
            setSocialDrawerOpen(false);
            openInvite([friend.id]);
          }}
          autoFocusSearch
          className="h-full"
        />
      </Dialog>
    </>
  );
}
