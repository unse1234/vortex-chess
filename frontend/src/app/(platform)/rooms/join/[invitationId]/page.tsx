import type { Metadata } from "next";
import { JoinInvitationScreen } from "@/screens/invitations/join-invitation-screen";

export const metadata: Metadata = {
  title: "Game invitation",
};

export default async function Page({ params }: PageProps<"/rooms/join/[invitationId]">) {
  const { invitationId } = await params;
  return <JoinInvitationScreen key={invitationId} invitationId={invitationId} />;
}
