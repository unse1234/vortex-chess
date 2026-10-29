import type { Metadata } from "next";
import { features } from "@/config/capabilities";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";
import { FriendsScreen } from "@/screens/social/friends-screen";
export const metadata: Metadata = { title: "Blocked accounts" };
export default function Page() {
  return features.socialManagement.available ? (
    <FriendsScreen blocked />
  ) : (
    <FeatureUnavailableScreen feature="socialManagement" />
  );
}
