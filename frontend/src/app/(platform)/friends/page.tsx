import type { Metadata } from "next";
import { features } from "@/config/capabilities";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";
import { FriendsScreen } from "@/screens/social/friends-screen";
export const metadata: Metadata = { title: "Friends" };
export default function Page() {
  return features.friends.available ? (
    <FriendsScreen />
  ) : (
    <FeatureUnavailableScreen feature="friends" />
  );
}
