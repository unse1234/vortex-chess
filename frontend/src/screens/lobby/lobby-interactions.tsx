"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Id of the desktop sidebar's friend search, focused by the header's community control. */
export const LOBBY_FRIEND_SEARCH_ID = "lobby-friend-search";

type LobbyInteractions = {
  /** Friend ids preselected in the open invite dialog; null while it's closed. */
  inviteFriendIds: readonly string[] | null;
  openInvite: (friendIds?: readonly string[]) => void;
  closeInvite: () => void;
  socialDrawerOpen: boolean;
  setSocialDrawerOpen: (open: boolean) => void;
};

const LobbyInteractionsContext = createContext<LobbyInteractions | null>(null);

export function useLobbyInteractions() {
  const value = useContext(LobbyInteractionsContext);
  if (!value) throw new Error("useLobbyInteractions must be used within LobbyInteractionsProvider");
  return value;
}

/**
 * Screen-local presentation state shared by launcher islands that live in
 * different features (header, action cards, social sidebar, invite dialog).
 */
export function LobbyInteractionsProvider({ children }: { children: ReactNode }) {
  const [inviteFriendIds, setInviteFriendIds] = useState<readonly string[] | null>(null);
  const [socialDrawerOpen, setSocialDrawerOpen] = useState(false);

  const value = useMemo<LobbyInteractions>(
    () => ({
      inviteFriendIds,
      openInvite: (friendIds = []) => setInviteFriendIds(friendIds),
      closeInvite: () => setInviteFriendIds(null),
      socialDrawerOpen,
      setSocialDrawerOpen,
    }),
    [inviteFriendIds, socialDrawerOpen],
  );

  return (
    <LobbyInteractionsContext.Provider value={value}>{children}</LobbyInteractionsContext.Provider>
  );
}
