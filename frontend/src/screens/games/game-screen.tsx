"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GameSessionProvider, useGameSessionState } from "@/features/games/providers/game-session-provider";
import { ratingsKeys } from "@/features/ratings/queries/ratings.queries";
import { GameScreenContent } from "@/screens/games/game-screen-content";
import { useGameAudio } from "@/screens/games/use-game-audio";

/** Live or archived game: loads the game, then composes board, players, analysis, moves and chat. */
export function GameScreen({ gameId, manual = false }: { gameId: string; manual?: boolean }) {
  const events = useGameAudio(gameId);
  return (
    // Keyed by game so that session state (orientation, pending commands) resets on navigation.
    <GameSessionProvider key={gameId} gameId={gameId} events={events}>
      <GameScreenContent manual={manual} />
      <RatingCompletionSync />
    </GameSessionProvider>
  );
}

/** Cross-feature cache coordination belongs to the screen composition layer. */
function RatingCompletionSync() {
  const session = useGameSessionState();
  const queryClient = useQueryClient();
  const settled = session.status === "ready" && session.game.rating?.changes != null;
  useEffect(() => {
    if (settled) void queryClient.invalidateQueries({ queryKey: ratingsKeys.all });
  }, [settled, queryClient]);
  return null;
}
