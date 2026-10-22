import { GameSessionProvider } from "@/features/games/providers/game-session-provider";
import { GameScreenContent } from "@/screens/games/game-screen-content";

/** Live or archived game: loads the game, then composes board, players, analysis, moves and chat. */
export function GameScreen({ gameId }: { gameId: string }) {
  return (
    // Keyed by game so that session state (orientation, pending commands) resets on navigation.
    <GameSessionProvider key={gameId} gameId={gameId}>
      <GameScreenContent />
    </GameSessionProvider>
  );
}
