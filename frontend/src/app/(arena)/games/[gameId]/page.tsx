import type { Metadata } from "next";
import { GameScreen } from "@/screens/games/game-screen";

export const metadata: Metadata = {
  title: "Arena",
};

export default async function GamePage({ params }: PageProps<"/games/[gameId]">) {
  const { gameId } = await params;
  return <GameScreen gameId={gameId} />;
}
