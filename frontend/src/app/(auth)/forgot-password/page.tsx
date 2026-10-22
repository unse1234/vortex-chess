import type { Metadata } from "next";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Access key recovery",
};

export default function Page() {
  return <FeatureUnavailableScreen feature="passwordRecovery" />;
}
