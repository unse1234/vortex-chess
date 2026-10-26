import { httpClient } from "@/lib/http/browser-client";
import type {
  CreateRoomRequest,
  RoomOptions,
  RoomResponse,
  RoomSettingsChange,
  RoomSnapshot,
} from "@/features/rooms/types/room.types";

const roomPath = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;

export async function getRoomOptions(signal?: AbortSignal): Promise<RoomOptions> {
  const { data } = await httpClient.get<RoomOptions>("/rooms/options", { signal });
  return data;
}

export async function createRoom(request: CreateRoomRequest): Promise<RoomSnapshot> {
  const { data } = await httpClient.post<RoomResponse>("/rooms", request);
  return data.room;
}

export async function getRoom(roomId: string, signal?: AbortSignal): Promise<RoomSnapshot> {
  const { data } = await httpClient.get<RoomResponse>(roomPath(roomId), { signal });
  return data.room;
}

/** The expected revision makes a request based on outdated settings fail instead of overwriting. */
export async function updateRoomSettings(
  roomId: string,
  expectedRevision: number,
  change: RoomSettingsChange,
): Promise<RoomSnapshot> {
  const { data } = await httpClient.patch<RoomResponse>(`${roomPath(roomId)}/settings`, {
    expectedRevision,
    ...change,
  });
  return data.room;
}

/** Readiness confirms the revision the player saw. */
export async function setRoomReady(
  roomId: string,
  expectedRevision: number,
  ready: boolean,
): Promise<RoomSnapshot> {
  const { data } = await httpClient.post<RoomResponse>(`${roomPath(roomId)}/ready`, {
    expectedRevision,
    ready,
  });
  return data.room;
}

/** Starts the room's one game; repeating it returns the already started room. */
export async function startRoom(roomId: string, expectedRevision: number): Promise<RoomSnapshot> {
  const { data } = await httpClient.post<RoomResponse>(`${roomPath(roomId)}/start`, { expectedRevision });
  return data.room;
}

export async function cancelRoom(roomId: string): Promise<RoomSnapshot> {
  const { data } = await httpClient.post<RoomResponse>(`${roomPath(roomId)}/cancel`);
  return data.room;
}

export async function leaveRoom(roomId: string): Promise<void> {
  await httpClient.post(`${roomPath(roomId)}/leave`);
}
