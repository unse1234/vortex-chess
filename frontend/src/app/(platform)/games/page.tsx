import type { Metadata } from "next";
import { GameHistoryScreen } from "@/screens/games/game-history-screen";

export const metadata: Metadata = {
  title: "Game history",
};

export default function Page() {
  return <GameHistoryScreen />;
}
