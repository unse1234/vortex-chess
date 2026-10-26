import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";
import { getInvitation, getRoomInvitations } from "@/features/invitations/services/invitations.service";
import { reconcileInvitation, reconcileInvitationList } from "@/features/invitations/realtime/reconcile-invitation";
import type { Invitation } from "@/features/invitations/types/invitation.types";

export const invitationKeys = {
  all: ["invitations"] as const,
  detail: (id: string) => [...invitationKeys.all, "detail", id] as const,
  room: (roomId: string) => [...invitationKeys.all, "room", roomId] as const,
};

function retryInvitationQuery(failureCount: number, error: Error) {
  if (error instanceof ApiError && !error.retryable) return false;
  return failureCount < 2;
}

export function invitationQueryOptions(id: string) {
  return queryOptions({
    queryKey: invitationKeys.detail(id),
    queryFn: ({ signal }) => getInvitation(id, signal),
    structuralSharing: (oldData, newData) =>
      reconcileInvitation(oldData as Invitation | undefined, newData as Invitation),
    retry: retryInvitationQuery,
    staleTime: 15_000,
  });
}

export function roomInvitationsQueryOptions(roomId: string) {
  return queryOptions({
    queryKey: invitationKeys.room(roomId),
    queryFn: ({ signal }) => getRoomInvitations(roomId, signal),
    structuralSharing: (oldData, newData) =>
      (newData as Invitation[]).reduce(
        (list, invitation) => reconcileInvitationList(list, invitation),
        ((oldData as Invitation[] | undefined) ?? []).filter((old) =>
          (newData as Invitation[]).some((item) => item.id === old.id),
        ),
      ),
    retry: retryInvitationQuery,
    staleTime: 15_000,
  });
}
