import { describe, expect, it } from "vitest";
import {
  applyRoomPresence,
  readinessWasReset,
  reconcileRoom,
} from "@/features/rooms/realtime/room-events";
import type { RoomSnapshot } from "@/features/rooms/types/room.types";

function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: "room-1",
    revision: 3,
    status: "waiting",
    settings: { timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 2_000 }, colorPreference: "random" },
    seats: {
      host: { player: { id: "host", username: "Host", avatarUrl: null }, ready: true, online: true, color: null },
      challenger: { player: { id: "guest", username: "Guest", avatarUrl: null }, ready: true, online: true, color: null },
    },
    expiresAt: "2026-10-22T14:00:00Z",
    closedAt: null,
    gameId: null,
    createdAt: "2026-10-22T12:00:00Z",
    updatedAt: "2026-10-22T12:00:00Z",
    viewer: { role: "challenger", canEditSettings: false, canInvite: false, canCancel: false, canLeave: true, canSetReady: true, canStart: false },
    ...overrides,
  };
}

describe("reconcileRoom", () => {
  it("keeps a newer realtime revision when a stale HTTP response arrives later", () => {
    const fromEvent = room({ revision: 5, status: "ready" });
    const staleFetch = room({ revision: 4 });
    expect(reconcileRoom(fromEvent, staleFetch)).toBe(fromEvent);
    expect(reconcileRoom(staleFetch, fromEvent)).toBe(fromEvent);
  });

  it("takes the latest arrival for the same revision and never merges different rooms", () => {
    const current = room();
    const sameRevision = room({ seats: { ...current.seats, host: { ...current.seats.host, online: false } } });
    expect(reconcileRoom(current, sameRevision)).toBe(sameRevision);
    const other = room({ id: "room-2", revision: 1 });
    expect(reconcileRoom(current, other)).toBe(other);
    expect(reconcileRoom(undefined, current)).toBe(current);
  });
});

describe("room presence and readiness", () => {
  it("patches presence without touching the revision", () => {
    const patched = applyRoomPresence(room(), "guest", false);
    expect(patched.seats.challenger?.online).toBe(false);
    expect(patched.revision).toBe(3);
    const unchanged = room();
    expect(applyRoomPresence(unchanged, "stranger", false)).toBe(unchanged);
  });

  it("detects readiness invalidated by a settings change", () => {
    const before = room();
    const after = room({
      revision: 4,
      settings: { ...before.settings, colorPreference: "white" },
      seats: {
        host: { ...before.seats.host, ready: false },
        challenger: { ...before.seats.challenger!, ready: false },
      },
    });
    expect(readinessWasReset(before, after)).toBe(true);
    // Un-readying yourself without a settings change is not a reset.
    expect(readinessWasReset(before, room({ revision: 4, seats: { ...before.seats, challenger: { ...before.seats.challenger!, ready: false } } }))).toBe(false);
    // A replayed older snapshot is ignored.
    expect(readinessWasReset(after, before)).toBe(false);
  });
});
