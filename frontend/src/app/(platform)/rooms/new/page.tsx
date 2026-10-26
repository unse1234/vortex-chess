import type { Metadata } from "next";
import { CreateRoomScreen } from "@/screens/rooms/create-room-screen";

export const metadata: Metadata = {
  title: "Create a room",
};

export default async function Page({ searchParams }: PageProps<"/rooms/new">) {
  // `invite` only prefills the recipient and `opponent` picks the setup; the backend authorizes everything.
  const { invite, opponent } = await searchParams;
  return (
    <CreateRoomScreen
      initialRecipient={typeof invite === "string" ? invite.slice(0, 254) : ""}
      opponent={opponent === "engine" ? "engine" : "player"}
    />
  );
}
