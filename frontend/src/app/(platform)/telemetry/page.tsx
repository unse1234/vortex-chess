import type { Metadata } from "next";
import { FeatureUnavailableScreen } from "@/screens/placeholder/feature-unavailable-screen";

export const metadata: Metadata = {
  title: "Telemetry",
};

export default function Page() {
  return <FeatureUnavailableScreen feature="telemetry" />;
}
