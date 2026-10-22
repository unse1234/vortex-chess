import type { Metadata } from "next";
import { LobbyScreen } from "@/screens/lobby/lobby-screen";

export const metadata: Metadata = {
  title: "Play",
};

export default function PlayPage() {
  return <LobbyScreen />;
}
