import type { Metadata } from "next";
import { RoomScreen } from "@/screens/rooms/room-screen";

export const metadata: Metadata = {
  title: "Waiting room",
};

export default async function Page({ params }: PageProps<"/rooms/[roomId]">) {
  const { roomId } = await params;
  return <RoomScreen key={roomId} roomId={roomId} />;
}
