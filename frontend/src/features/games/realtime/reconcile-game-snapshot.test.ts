import { describe, expect, it } from "vitest";
import {
  getSnapshotReceivedAt,
  hasRevisionGap,
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameSnapshot } from "@/features/games/types/game.types";

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: "game-1",
    revision: 1,
    rated: true,
    timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 2_000 },
    region: "EU-CENTRAL",
    spectatorCount: 0,
    fen: "start",
    status: { phase: "in-progress", turn: "w" },
    players: {} as GameSnapshot["players"],
    clocks: { remainingMs: { w: 1000, b: 1000 }, runningSide: "w", serverTime: 5_000 },
    moves: [],
    lastMove: null,
    checkSquare: null,
    captured: { w: [], b: [] },
    viewer: { role: "spectator", color: null, canMove: false, canResign: false, canOfferDraw: false, canRespondToDraw: false },
    legalMoves: {},
    drawOffer: null,
    analysis: { availability: "unavailable" },
    ...overrides,
  };
}

describe("reconcileGameSnapshot", () => {
  it("takes the first snapshot it sees", () => {
    const incoming = snapshot({ revision: 4 });
    expect(reconcileGameSnapshot(undefined, incoming)).toBe(incoming);
  });

  it("applies a newer snapshot", () => {
    const current = snapshot({ revision: 4 });
    const incoming = snapshot({ revision: 5 });
    expect(reconcileGameSnapshot(current, incoming)).toBe(incoming);
  });

  it("keeps the newer snapshot when a stale HTTP fetch completes after a realtime event", () => {
    // Fetch starts at revision 4, a realtime event brings revision 6, then the fetch resolves.
    const fromEvent = snapshot({ revision: 6, fen: "after-event" });
    const staleFetch = snapshot({ revision: 4, fen: "before-event" });
    expect(reconcileGameSnapshot(fromEvent, staleFetch)).toBe(fromEvent);
  });

  it("keeps the current object when a refetch returns the same revision, to avoid churn", () => {
    const current = snapshot({ revision: 4 });
    expect(reconcileGameSnapshot(current, snapshot({ revision: 4 }))).toBe(current);
  });

  it("never merges snapshots of different games", () => {
    const current = snapshot({ id: "game-1", revision: 9 });
    const other = snapshot({ id: "game-2", revision: 1 });
    expect(reconcileGameSnapshot(current, other)).toBe(other);
  });
});

describe("hasRevisionGap", () => {
  it("is false for the next revision and for repeats", () => {
    const current = snapshot({ revision: 4 });
    expect(hasRevisionGap(current, snapshot({ revision: 5 }))).toBe(false);
    expect(hasRevisionGap(current, snapshot({ revision: 4 }))).toBe(false);
    expect(hasRevisionGap(current, snapshot({ revision: 2 }))).toBe(false);
  });

  it("is true when an update was skipped, so the cache must be resynchronised", () => {
    expect(hasRevisionGap(snapshot({ revision: 4 }), snapshot({ revision: 6 }))).toBe(true);
  });

  it("is false with nothing cached yet", () => {
    expect(hasRevisionGap(undefined, snapshot({ revision: 12 }))).toBe(false);
  });
});

describe("snapshot arrival stamps", () => {
  it("records arrival time once and falls back to the server's reading time", () => {
    const stamped = snapshot();
    expect(getSnapshotReceivedAt(stamped)).toBe(5_000);

    const before = Date.now();
    stampSnapshotReceived(stamped);
    const first = getSnapshotReceivedAt(stamped);
    expect(first).toBeGreaterThanOrEqual(before);

    stampSnapshotReceived(stamped);
    expect(getSnapshotReceivedAt(stamped)).toBe(first);
  });
});
