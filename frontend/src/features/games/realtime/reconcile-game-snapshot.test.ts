import { describe, expect, it } from "vitest";
import {
  applyGameUpdate,
  carryReceivedAt,
  getSnapshotReceivedAt,
  reconcileGameSnapshot,
  stampSnapshotReceived,
} from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameMove, GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

function snapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    id: "game-1",
    roomId: "room-1",
    revision: 1,
    ply: 0,
    timeControl: { category: "blitz", initialMs: 180_000, incrementMs: 2_000 },
    initialFen: "start",
    fen: "start",
    status: { phase: "in-progress", turn: "w" },
    players: {
      w: { id: "white", username: "White", avatarUrl: null, kind: "human", online: true },
      b: { id: "black", username: "Black", avatarUrl: null, kind: "human", online: true },
    },
    clocks: { remainingMs: { w: 1000, b: 1000 }, runningSide: "w", serverTime: 5_000 },
    moves: [],
    lastMove: null,
    checkSquare: null,
    viewer: { role: "player", color: "b", canMove: false, canResign: true, canOfferDraw: true, canRespondToDraw: false },
    legalMoves: {},
    drawOffer: null,
    startedAt: "2026-10-26T10:00:00.000Z",
    endedAt: null,
    pgn: null,
    ...overrides,
  };
}

function move(ply: number, san = "e4"): GameMove {
  return {
    ply,
    color: ply % 2 === 1 ? "w" : "b",
    san,
    uci: "e2e4",
    from: "e2",
    to: "e4",
    promotion: null,
    captured: null,
    fen: `after-${ply}`,
    remainingMs: { w: 1000, b: 1000 },
    elapsedMs: 0,
    playedAt: "2026-10-26T10:00:01.000Z",
    requestId: null,
  };
}

/** The compact event the server broadcasts after committing `ply` at `revision`. */
function update(revision: number, ply: number, withMove = true, overrides: Partial<GameUpdate> = {}): GameUpdate {
  const { id, status, clocks, lastMove, checkSquare, drawOffer, viewer, legalMoves, endedAt } = snapshot();
  const live = { id, status, clocks, lastMove, checkSquare, drawOffer, viewer, legalMoves, endedAt };
  return { ...live, revision, ply, fen: `after-${ply}`, move: withMove ? move(ply) : null, ...overrides };
}

describe("reconcileGameSnapshot", () => {
  it("fills final PGN from the full read without changing the recorded position or clocks", () => {
    const current = snapshot({ status: { phase: "finished", result: { outcome: "black", reason: "resignation" } } });
    const merged = reconcileGameSnapshot(current, { ...current, pgn: "[Result \"0-1\"]\n\n0-1" });
    expect(merged.pgn).toContain("0-1");
    expect(merged.moves).toBe(current.moves);
    expect(merged.clocks).toBe(current.clocks);
    expect(reconcileGameSnapshot(merged, { ...current, pgn: "different" }).pgn).toBe(merged.pgn);
  });
  it("applies a newer snapshot and keeps the newer one when a stale HTTP fetch completes late", () => {
    const fromEvent = snapshot({ revision: 6, fen: "after-event" });
    const staleFetch = snapshot({ revision: 4, fen: "before-event" });
    expect(reconcileGameSnapshot(staleFetch, fromEvent)).toBe(fromEvent);
    expect(reconcileGameSnapshot(fromEvent, staleFetch)).toBe(fromEvent);
  });

  it("keeps the current object for the same revision unless presence changed", () => {
    const current = snapshot({ revision: 4 });
    expect(reconcileGameSnapshot(current, snapshot({ revision: 4 }))).toBe(current);
    const offline = snapshot({ revision: 4, players: { ...current.players, b: { ...current.players.b, online: false } } });
    const merged = reconcileGameSnapshot(current, offline);
    expect(merged.players.b.online).toBe(false);
    expect(merged.revision).toBe(4);
  });

  it("never merges snapshots of different games", () => {
    const other = snapshot({ id: "game-2", revision: 1 });
    expect(reconcileGameSnapshot(snapshot({ revision: 9 }), other)).toBe(other);
  });
});

describe("applyGameUpdate", () => {
  it("appends the newly accepted move from the next revision without refetching", () => {
    const result = applyGameUpdate(snapshot(), update(2, 1));
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.game).toMatchObject({ revision: 2, ply: 1, fen: "after-1", roomId: "room-1" });
    expect(result.game.moves.map((m) => m.ply)).toEqual([1]);
    expect("move" in result.game).toBe(false);
  });

  it("applies a non-move change (a draw offer) without touching the move list", () => {
    const current = snapshot({ revision: 3, ply: 1, moves: [move(1)] });
    const result = applyGameUpdate(current, update(4, 1, false, { drawOffer: { by: "w", state: "pending" } }));
    expect(result).toMatchObject({ kind: "applied", game: { revision: 4, ply: 1, drawOffer: { by: "w", state: "pending" } } });
  });

  it("ignores duplicates, stale events and events from another game", () => {
    const current = snapshot({ revision: 5, ply: 3, moves: [move(1), move(2), move(3)] });
    expect(applyGameUpdate(current, update(5, 3))).toEqual({ kind: "ignored" });
    expect(applyGameUpdate(current, update(2, 1))).toEqual({ kind: "ignored" });
    expect(applyGameUpdate(current, update(6, 4, true, { id: "previous-game" }))).toEqual({ kind: "ignored" });
  });

  it("reports a gap when an event was missed, so the cache is resynchronized", () => {
    const current = snapshot({ revision: 5, ply: 3, moves: [move(1), move(2), move(3)] });
    expect(applyGameUpdate(current, update(7, 5))).toEqual({ kind: "gap" });
    // Revision and ply are separate: the next revision must still carry the next ply.
    expect(applyGameUpdate(current, update(6, 5))).toEqual({ kind: "gap" });
    // A duplicate acknowledgement carries no move: its state can't be applied locally.
    expect(applyGameUpdate(current, update(6, 4, false))).toEqual({ kind: "gap" });
    expect(applyGameUpdate(undefined, update(2, 1))).toEqual({ kind: "gap" });
  });
});

describe("clock anchors", () => {
  it("records arrival time once, falls back to the server reading time, and survives presence patches", () => {
    const stamped = snapshot();
    expect(getSnapshotReceivedAt(stamped)).toBe(5_000);
    const before = Date.now();
    stampSnapshotReceived(stamped);
    const first = getSnapshotReceivedAt(stamped);
    expect(first).toBeGreaterThanOrEqual(before);
    stampSnapshotReceived(stamped);
    expect(getSnapshotReceivedAt(stamped)).toBe(first);
    const patched = carryReceivedAt(stamped, { ...stamped });
    expect(getSnapshotReceivedAt(patched)).toBe(first);
  });
});
