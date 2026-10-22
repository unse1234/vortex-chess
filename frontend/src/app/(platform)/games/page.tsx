import type { Metadata } from "next";
import { RoutePlaceholder } from "@/screens/placeholder/route-placeholder";

export const metadata: Metadata = {
  title: "Game history",
};

export default function Page() {
  return <RoutePlaceholder title="Game history" description="The game archive is not designed yet. This route is open so links resolve." />;
}
