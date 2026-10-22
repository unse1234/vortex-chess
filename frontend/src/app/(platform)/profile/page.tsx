import type { Metadata } from "next";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Profile",
};

export default function Page() {
  return <FeatureUnavailableScreen feature="profile" />;
}
