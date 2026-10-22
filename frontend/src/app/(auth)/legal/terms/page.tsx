import type { Metadata } from "next";
import { RoutePlaceholder } from "@/screens/placeholder/route-placeholder";

export const metadata: Metadata = {
  title: "Combat Protocols",
};

export default function Page() {
  return <RoutePlaceholder title="Combat Protocols" description="The terms are not written yet. This route is open so links resolve." />;
}
