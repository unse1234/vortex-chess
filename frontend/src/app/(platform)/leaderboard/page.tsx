import type { Metadata } from "next";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";
import { features } from "@/config/capabilities";
import { LeaderboardScreen } from "@/screens/leaderboard/leaderboard-screen";

export const metadata: Metadata = {
  title: "Leaderboard",
};

export default function Page() {
  return features.leaderboard.available ? <LeaderboardScreen /> : <FeatureUnavailableScreen feature="leaderboard" />;
}
