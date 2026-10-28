"use client";

import { GameSessionProvider } from "@/features/games/providers/game-session-provider";
import { GameScreenContent } from "@/screens/games/game-screen-content";
import { useGameAudio } from "@/screens/games/use-game-audio";

/** Live or archived game: loads the game, then composes board, players, analysis, moves and chat. */
export function GameScreen({ gameId, manual = false }: { gameId: string; manual?: boolean }) {
  const events = useGameAudio(gameId);
  return (
    // Keyed by game so that session state (orientation, pending commands) resets on navigation.
    <GameSessionProvider key={gameId} gameId={gameId} events={events}>
      <GameScreenContent manual={manual} />
    </GameSessionProvider>
  );
}
