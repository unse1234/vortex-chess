import type { Metadata } from "next";
import { GameScreen } from "@/screens/games/game-screen";

export const metadata: Metadata = { title: "Manual analysis" };
export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return <GameScreen gameId={gameId} manual />;
}
