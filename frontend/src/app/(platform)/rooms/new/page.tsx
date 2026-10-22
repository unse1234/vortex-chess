import type { Metadata } from "next";
import { RoutePlaceholder } from "@/screens/placeholder/route-placeholder";

export const metadata: Metadata = {
  title: "Create a room",
};

export default function Page() {
  return <RoutePlaceholder title="Create a room" description="Room setup is not designed yet. This route is open so links resolve." />;
}
