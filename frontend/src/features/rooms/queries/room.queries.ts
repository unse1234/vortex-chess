import { queryOptions } from "@tanstack/react-query";
import { ApiError } from "@/lib/http/api-error";
import { reconcileRoom } from "@/features/rooms/realtime/room-events";
import { getRoom, getRoomOptions } from "@/features/rooms/services/rooms.service";
import type { RoomSnapshot } from "@/features/rooms/types/room.types";

export const roomKeys = {
  all: ["rooms"] as const,
  options: () => [...roomKeys.all, "options"] as const,
  detail: (roomId: string) => [...roomKeys.all, "detail", roomId] as const,
};

function retryRoomQuery(failureCount: number, error: Error) {
  if (error instanceof ApiError && !error.retryable) return false;
  return failureCount < 2;
}

export function roomOptionsQueryOptions() {
  return queryOptions({
    queryKey: roomKeys.options(),
    queryFn: ({ signal }) => getRoomOptions(signal),
    staleTime: 10 * 60_000,
  });
}

export function roomQueryOptions(roomId: string, options: { pollMs?: number | false } = {}) {
  return queryOptions({
    queryKey: roomKeys.detail(roomId),
    queryFn: ({ signal }) => getRoom(roomId, signal),
    // Also applied to fetch completions, so a stale response cannot roll back
    // a newer revision delivered in realtime.
    structuralSharing: (oldData, newData) =>
      reconcileRoom(oldData as RoomSnapshot | undefined, newData as RoomSnapshot),
    retry: retryRoomQuery,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "cancelled" || status === "expired" ? false : (options.pollMs ?? false);
    },
  });
}
