import { expect, it } from "vitest";
import { roomWasStarted } from "./room-events";
import type { RoomSnapshot } from "@/features/rooms/types/room.types";

const now = Date.parse("2026-10-28T10:00:00Z");
const waiting: RoomSnapshot = {
  id: "r", revision: 2, status: "ready", gameId: null,
  settings: { timeControl: { category: "blitz", initialMs: 180000, incrementMs: 0 }, colorPreference: "white" },
  seats: { host: { player: { id: "u", username: "User", avatarUrl: null }, ready: true, online: true, color: "white" }, challenger: null },
  createdAt: new Date(now - 60000).toISOString(), updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(), closedAt: null,
  viewer: { role: "host", canEditSettings: false, canInvite: false, canCancel: true, canLeave: false, canSetReady: true, canStart: true },
};
const started: RoomSnapshot = { ...waiting, revision: 3, status: "started", gameId: "g" };

it("announces a fresh accepted start once regardless of acknowledgement/event order", () => {
  expect(roomWasStarted(waiting, started, now)).toBe(true);
  expect(roomWasStarted(started, started, now)).toBe(false);
  expect(roomWasStarted(started, { ...started, revision: 4 }, now)).toBe(false);
});
it("does not announce initial, stale, wrong-room, closed or reconnect catch-up states", () => {
  expect(roomWasStarted(undefined, started, now)).toBe(false);
  expect(roomWasStarted(waiting, { ...started, revision: 2 }, now)).toBe(false);
  expect(roomWasStarted(waiting, { ...started, id: "another" }, now)).toBe(false);
  expect(roomWasStarted(waiting, { ...started, gameId: null }, now)).toBe(false);
  expect(roomWasStarted(waiting, { ...started, status: "cancelled" }, now)).toBe(false);
  expect(roomWasStarted(waiting, started, now + 6000)).toBe(false);
});
