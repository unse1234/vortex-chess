import type { RoomSnapshot } from "@/features/rooms/types/room.types";

export function roomChannel(roomId: string) {
  return `room:${roomId}`;
}

/** A committed transition, never an initial load or replayed room snapshot. */
export function roomWasStarted(previous: RoomSnapshot | undefined, next: RoomSnapshot, now = Date.now()) {
  return !!previous && previous.id === next.id && next.revision > previous.revision &&
    (previous.status === "waiting" || previous.status === "ready") && next.status === "started" &&
    next.gameId !== null && Math.abs(now - Date.parse(next.updatedAt)) < 5_000;
}

/** Events on an authorized room channel. Snapshots are complete and viewer-specific. */
export type RoomRealtimeEvent =
  | { type: "room.updated"; payload: { room: RoomSnapshot } }
  | { type: "room.presence"; payload: { roomId: string; userId: string; online: boolean } };

/**
 * One policy for HTTP fetches, mutation responses and realtime events: a lower
 * revision never replaces a higher one. An equal revision is the same
 * persisted state, so the newer arrival wins (it may carry fresher presence).
 */
export function reconcileRoom(current: RoomSnapshot | undefined, incoming: RoomSnapshot): RoomSnapshot {
  if (!current || current.id !== incoming.id) return incoming;
  return incoming.revision >= current.revision ? incoming : current;
}

/** Presence is not persisted room state, so it is patched without a revision. */
export function applyRoomPresence(room: RoomSnapshot, userId: string, online: boolean): RoomSnapshot {
  const { host, challenger } = room.seats;
  if (host.player.id === userId && host.online !== online)
    return { ...room, seats: { ...room.seats, host: { ...host, online } } };
  if (challenger?.player.id === userId && challenger.online !== online)
    return { ...room, seats: { ...room.seats, challenger: { ...challenger, online } } };
  return room;
}

/** True when the update reset readiness the viewer had confirmed, e.g. after a settings change. */
export function readinessWasReset(previous: RoomSnapshot | undefined, next: RoomSnapshot) {
  if (!previous || previous.id !== next.id || next.revision <= previous.revision) return false;
  const mine = (room: RoomSnapshot) =>
    room.viewer.role === "host" ? room.seats.host.ready : (room.seats.challenger?.ready ?? false);
  const settingsChanged =
    previous.settings.colorPreference !== next.settings.colorPreference ||
    previous.settings.timeControl.initialMs !== next.settings.timeControl.initialMs ||
    previous.settings.timeControl.incrementMs !== next.settings.timeControl.incrementMs;
  return settingsChanged && mine(previous) && !mine(next);
}
