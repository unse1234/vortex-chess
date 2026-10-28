import type { Metadata } from "next";
import { MatchmakingScreen } from "@/screens/matchmaking/matchmaking-screen";
import { features } from "@/config/capabilities";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Matchmaking",
};

export default function Page() {
  return features.matchmaking.available ? <MatchmakingScreen /> : <FeatureUnavailableScreen feature="matchmaking" />;
}
