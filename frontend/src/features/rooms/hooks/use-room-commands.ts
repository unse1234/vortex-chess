"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";
import { roomKeys } from "@/features/rooms/queries/room.queries";
import { reconcileRoom } from "@/features/rooms/realtime/room-events";
import {
  cancelRoom,
  createRoom,
  leaveRoom,
  setRoomReady,
  startRoom,
  updateRoomSettings,
} from "@/features/rooms/services/rooms.service";
import type { RoomSettingsChange, RoomSnapshot } from "@/features/rooms/types/room.types";

/** Room mutations. Each carries the revision the viewer acted on; responses merge by revision. */
export function useRoomCommands(roomId: string) {
  const queryClient = useQueryClient();
  const queryKey = roomKeys.detail(roomId);
  const apply = (room: RoomSnapshot) =>
    queryClient.setQueryData<RoomSnapshot>(queryKey, (current) => reconcileRoom(current, room));
  // A conflict means our view was stale: fetch the latest state for the player to review.
  const refreshOnConflict = (error: Error) => {
    if (error instanceof ApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey });
  };

  const updateSettings = useMutation({
    mutationFn: ({ expectedRevision, change }: { expectedRevision: number; change: RoomSettingsChange }) =>
      updateRoomSettings(roomId, expectedRevision, change),
    onSuccess: apply,
    onError: refreshOnConflict,
  });
  const setReady = useMutation({
    mutationFn: ({ expectedRevision, ready }: { expectedRevision: number; ready: boolean }) =>
      setRoomReady(roomId, expectedRevision, ready),
    onSuccess: apply,
    onError: refreshOnConflict,
  });
  const start = useMutation({
    mutationFn: ({ expectedRevision }: { expectedRevision: number }) => startRoom(roomId, expectedRevision),
    onSuccess: apply,
    onError: refreshOnConflict,
  });
  const cancel = useMutation({
    mutationFn: () => cancelRoom(roomId),
    onSuccess: apply,
    onError: refreshOnConflict,
  });
  const leave = useMutation({
    mutationFn: () => leaveRoom(roomId),
    onSuccess: () => queryClient.removeQueries({ queryKey }),
  });

  return { updateSettings, setReady, start, cancel, leave };
}

/** Creates a room and seeds its cache entry for the waiting room. */
export function useCreateRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRoom,
    onSuccess: (room) => queryClient.setQueryData(roomKeys.detail(room.id), room),
  });
}
