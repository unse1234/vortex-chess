"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeClient, useRealtimeStatus } from "@/lib/realtime/realtime-context";
import { roomKeys, roomQueryOptions } from "@/features/rooms/queries/room.queries";
import {
  applyRoomPresence,
  readinessWasReset,
  roomWasStarted,
  reconcileRoom,
  roomChannel,
  type RoomRealtimeEvent,
} from "@/features/rooms/realtime/room-events";
import type { RoomSnapshot } from "@/features/rooms/types/room.types";

/** Without a realtime connection the room is refreshed over HTTP at this interval. */
const POLL_INTERVAL_MS = 5_000;

/**
 * - live: subscribed; changes arrive as they commit
 * - polling: no realtime connection; refreshed over HTTP
 * - reconnecting: the connection dropped; the rejoin brings a fresh snapshot
 */
export type RoomConnection = "live" | "polling" | "reconnecting";

/** Loads one room and keeps it current from its authorized realtime channel. */
export function useRoomSession(roomId: string, onStarted?: (gameId: string) => void) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const realtimeStatus = useRealtimeStatus(realtime);
  const live = realtime !== null && realtimeStatus === "connected";
  const query = useQuery(roomQueryOptions(roomId, { pollMs: live ? false : POLL_INTERVAL_MS }));
  const [readinessReset, setReadinessReset] = useState(false);

  useEffect(() => {
    if (!realtime) return;
    const queryKey = roomKeys.detail(roomId);
    let synchronized = false;
    const unsubscribe = realtime.subscribe(roomChannel(roomId), (event) => {
      if (event.type === "room.updated") {
        const incoming = (event as unknown as Extract<RoomRealtimeEvent, { type: "room.updated" }>).payload.room;
        if (incoming.id !== roomId) return;
        const previous = queryClient.getQueryData<RoomSnapshot>(queryKey);
        if (synchronized && realtime.getStatus() === "connected" && roomWasStarted(previous, incoming)) onStarted?.(incoming.gameId!);
        // room.updated also carries the join/rejoin snapshot: the first is always silent.
        synchronized = true;
        if (readinessWasReset(queryClient.getQueryData<RoomSnapshot>(queryKey), incoming)) setReadinessReset(true);
        queryClient.setQueryData<RoomSnapshot>(queryKey, (current) => reconcileRoom(current, incoming));
      } else if (event.type === "room.presence") {
        const { roomId: target, userId, online } = (
          event as unknown as Extract<RoomRealtimeEvent, { type: "room.presence" }>
        ).payload;
        if (target !== roomId) return;
        queryClient.setQueryData<RoomSnapshot>(queryKey, (current) =>
          current ? applyRoomPresence(current, userId, online) : current,
        );
      } else if (event.type === "channel.error" || event.type === "channel.closed") {
        synchronized = false;
        // Access changed or the subscription is uncertain: the HTTP snapshot decides.
        void queryClient.invalidateQueries({ queryKey });
      }
    });
    const unsubscribeStatus = realtime.onStatusChange((status) => {
      if (status !== "connected") synchronized = false;
    });
    const visibility = () => { synchronized = false; };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe();
      unsubscribeStatus();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [realtime, roomId, queryClient, onStarted]);

  const connection: RoomConnection = live
    ? "live"
    : realtime !== null && realtimeStatus === "reconnecting"
      ? "reconnecting"
      : "polling";

  return {
    query,
    connection,
    readinessReset,
    dismissReadinessReset: useCallback(() => setReadinessReset(false), []),
  };
}
