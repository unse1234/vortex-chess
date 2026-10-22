"use client";

import { useGameSessionState } from "@/features/games/providers/game-session-provider";
import { GameLayout } from "@/screens/games/game-layout";
import { GameScreenSkeleton } from "@/screens/games/game-screen-skeleton";
import { GameUnavailable } from "@/screens/games/game-unavailable";

/** Chooses between the loading, unavailable and loaded states of the game screen. */
export function GameScreenContent() {
  const session = useGameSessionState();

  if (session.status === "pending") return <GameScreenSkeleton />;
  if (session.status === "error") {
    return <GameUnavailable error={session.error} onRetry={session.retry} retrying={session.retrying} />;
  }
  return <GameLayout />;
}
