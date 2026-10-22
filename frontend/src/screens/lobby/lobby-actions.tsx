"use client";

import { GameActionCards } from "@/features/lobby/components/game-action-cards";
import { useLobbyInteractions } from "@/screens/lobby/lobby-interactions";

export function LobbyActions() {
  const { openInvite } = useLobbyInteractions();
  return <GameActionCards onPlayWithFriends={() => openInvite()} />;
}
