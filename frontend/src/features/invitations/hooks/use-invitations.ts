"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";
import { useRealtimeClient } from "@/lib/realtime/realtime-context";
import { PERSONAL_CHANNEL } from "@/lib/realtime/realtime-contract";
import {
  invitationKeys,
  invitationQueryOptions,
  roomInvitationsQueryOptions,
} from "@/features/invitations/queries/invitation.queries";
import {
  reconcileInvitation,
  reconcileInvitationList,
  type InvitationRealtimeEvent,
} from "@/features/invitations/realtime/reconcile-invitation";
import {
  acceptInvitation,
  cancelInvitation,
  declineInvitation,
  sendInvitation,
} from "@/features/invitations/services/invitations.service";
import type { Invitation } from "@/features/invitations/types/invitation.types";

/** Merges one authoritative invitation into every cache entry that holds it. */
function applyInvitation(queryClient: QueryClient, invitation: Invitation) {
  queryClient.setQueryData<Invitation>(invitationKeys.detail(invitation.id), (current) =>
    current ? reconcileInvitation(current, invitation) : current,
  );
  queryClient.setQueryData<Invitation[]>(invitationKeys.room(invitation.room.id), (list) =>
    list ? reconcileInvitationList(list, invitation) : list,
  );
}

export function useInvitationQuery(id: string) {
  return useQuery(invitationQueryOptions(id));
}

/** Host-only list of invitations sent for one room. */
export function useRoomInvitationsQuery(roomId: string, enabled: boolean) {
  return useQuery({ ...roomInvitationsQueryOptions(roomId), enabled });
}

export function useSendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, recipient }: { roomId: string; recipient: string }) =>
      sendInvitation(roomId, recipient),
    onSuccess: (invitation) => {
      queryClient.setQueryData<Invitation[]>(invitationKeys.room(invitation.room.id), (list) =>
        reconcileInvitationList(list ?? [], invitation),
      );
    },
  });
}

/** Accept, decline and cancel; repeats return the existing outcome or a clear conflict. */
export function useInvitationActions(id: string) {
  const queryClient = useQueryClient();
  const onSuccess = (invitation: Invitation) => {
    queryClient.setQueryData<Invitation>(invitationKeys.detail(id), (current) =>
      reconcileInvitation(current, invitation),
    );
    applyInvitation(queryClient, invitation);
  };
  // Conflicts (expired, cancelled, room full…) mean the shown state is stale.
  const onError = (error: Error) => {
    if (error instanceof ApiError && (error.status === 409 || error.status === 404))
      void queryClient.invalidateQueries({ queryKey: invitationKeys.detail(id) });
  };
  return {
    accept: useMutation({ mutationFn: () => acceptInvitation(id), onSuccess, onError }),
    decline: useMutation({ mutationFn: () => declineInvitation(id), onSuccess, onError }),
    cancel: useMutation({ mutationFn: () => cancelInvitation(id), onSuccess, onError }),
  };
}

/**
 * Keeps invitation caches current from the personal channel, and refetches
 * them after a reconnect so changes missed while disconnected are recovered.
 */
export function useInvitationsRealtime() {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();

  useEffect(() => {
    if (!realtime) return;
    const unsubscribe = realtime.subscribe(PERSONAL_CHANNEL, (event) => {
      if (event.type !== "invitation.updated") return;
      const { invitation } = (event as unknown as InvitationRealtimeEvent).payload;
      if (invitation) applyInvitation(queryClient, invitation);
    });
    let previous = realtime.getStatus();
    const unsubscribeStatus = realtime.onStatusChange((status) => {
      if (status === "connected" && previous !== "connected")
        void queryClient.invalidateQueries({ queryKey: invitationKeys.all });
      previous = status;
    });
    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [realtime, queryClient]);
}
