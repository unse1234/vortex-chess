import { httpClient } from "@/lib/http/browser-client";
import type {
  Invitation,
  InvitationList,
  InvitationResponse,
} from "@/features/invitations/types/invitation.types";

const invitationPath = (id: string) => `/invitations/${encodeURIComponent(id)}`;

/** The backend resolves the username or email to an account and binds the invitation to it. */
export async function sendInvitation(roomId: string, recipient: string): Promise<Invitation> {
  const { data } = await httpClient.post<InvitationResponse>(
    `/rooms/${encodeURIComponent(roomId)}/invitations`,
    { recipient },
  );
  return data.invitation;
}

export async function getRoomInvitations(roomId: string, signal?: AbortSignal): Promise<Invitation[]> {
  const { data } = await httpClient.get<InvitationList>(`/rooms/${encodeURIComponent(roomId)}/invitations`, { signal });
  return data.items;
}

export async function getInvitation(id: string, signal?: AbortSignal): Promise<Invitation> {
  const { data } = await httpClient.get<InvitationResponse>(invitationPath(id), { signal });
  return data.invitation;
}

export async function acceptInvitation(id: string): Promise<Invitation> {
  const { data } = await httpClient.post<InvitationResponse>(`${invitationPath(id)}/accept`);
  return data.invitation;
}

export async function declineInvitation(id: string): Promise<Invitation> {
  const { data } = await httpClient.post<InvitationResponse>(`${invitationPath(id)}/decline`);
  return data.invitation;
}

export async function cancelInvitation(id: string): Promise<Invitation> {
  const { data } = await httpClient.post<InvitationResponse>(`${invitationPath(id)}/cancel`);
  return data.invitation;
}
