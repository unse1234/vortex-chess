"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Id of the desktop sidebar's friend search, focused by the header's community control. */
export const LOBBY_FRIEND_SEARCH_ID = "lobby-friend-search";

type LobbyInteractions = {
  /** Username/email prefilled in the open invite dialog; null while it's closed. */
  inviteRecipient: string | null;
  openInvite: (recipient?: string) => void;
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
  const [inviteRecipient, setInviteRecipient] = useState<string | null>(null);
  const [socialDrawerOpen, setSocialDrawerOpen] = useState(false);

  const value = useMemo<LobbyInteractions>(
    () => ({
      inviteRecipient,
      openInvite: (recipient = "") => setInviteRecipient(recipient),
      closeInvite: () => setInviteRecipient(null),
      socialDrawerOpen,
      setSocialDrawerOpen,
    }),
    [inviteRecipient, socialDrawerOpen],
  );

  return (
    <LobbyInteractionsContext.Provider value={value}>{children}</LobbyInteractionsContext.Provider>
  );
}
