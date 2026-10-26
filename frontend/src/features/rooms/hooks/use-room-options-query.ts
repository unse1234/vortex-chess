"use client";

import { useQuery } from "@tanstack/react-query";
import { roomOptionsQueryOptions } from "@/features/rooms/queries/room.queries";

/** Supported time controls and colour preferences, as defined by the backend. */
export function useRoomOptionsQuery() {
  return useQuery(roomOptionsQueryOptions());
}
