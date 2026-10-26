"use client";

import { useState } from "react";
import Link from "next/link";
import { capabilities, features } from "@/config/capabilities";
import { routes } from "@/config/routes";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { PostGameWorkspace } from "@/screens/games/post-game-workspace";
import { useGameSessionState } from "@/features/games/providers/game-session-provider";
import { GameLayout } from "@/screens/games/game-layout";
import { GameScreenSkeleton } from "@/screens/games/game-screen-skeleton";
import { GameUnavailable } from "@/screens/games/game-unavailable";

/** Chooses between the loading, unavailable and loaded states of the game screen. */
export function GameScreenContent({ manual = false }: { manual?: boolean }) {
  const session = useGameSessionState();
  const account = useSessionQuery();
  const [hadActiveGame, setHadActiveGame] = useState(false);
  if (
    session.status === "ready" &&
    session.game.status.phase === "in-progress" &&
    !hadActiveGame
  )
    setHadActiveGame(true);

  // Session loss unmounts the local tree immediately, including cross-tab logout.
  if (capabilities.enforceSignIn && !account.data)
    return <GameScreenSkeleton />;

  if (session.status === "pending") return <GameScreenSkeleton />;
  if (session.status === "error") {
    return (
      <GameUnavailable
        error={session.error}
        onRetry={session.retry}
        retrying={session.retrying}
      />
    );
  }
  if (
    manual &&
    (!features.manualAnalysis.available ||
      session.game.status.phase !== "finished")
  ) {
    return (
      <main id="main-content" className="p-8">
        <h1>Manual analysis is available after the game finishes.</h1>
        <Link href={routes.game(session.game.id)}>Return to game</Link>
      </main>
    );
  }
  if (session.game.status.phase === "finished")
    return (
      <PostGameWorkspace
        key={`${session.game.id}:${account.data?.id}:${manual}`}
        manual={manual}
        announceResult={hadActiveGame}
      />
    );
  return <GameLayout />;
}
