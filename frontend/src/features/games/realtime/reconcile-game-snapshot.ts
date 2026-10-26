import type { GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

/**
 * The one policy for complete snapshots, used by HTTP fetches and channel
 * joins alike: the higher revision wins, so an older response arriving late
 * can never roll the board back. An equal revision is the same committed
 * state; fresher presence and a missing final PGN may be filled from it.
 */
export function reconcileGameSnapshot(
  current: GameSnapshot | undefined,
  incoming: GameSnapshot,
): GameSnapshot {
  if (!current || current.id !== incoming.id) return incoming;
  if (incoming.revision > current.revision) return incoming;
  if (incoming.revision < current.revision) return current;
  const presenceChanged = (["w", "b"] as const).some(
    (color) => current.players[color].online !== incoming.players[color].online,
  );
  // Compact completion events omit PGN. A full read of that same committed
  // revision may fill it once, without replacing moves, clocks or result.
  const fillPgn = current.status.phase === "finished" && incoming.status.phase === "finished" && current.pgn === null && incoming.pgn !== null;
  return presenceChanged || fillPgn
    ? carryReceivedAt(current, { ...current, players: presenceChanged ? incoming.players : current.players, pgn: fillPgn ? incoming.pgn : current.pgn })
    : current;
}

export type UpdateResult =
  | { kind: "applied"; game: GameSnapshot }
  /** Already reflected (a duplicate, or older than what is shown). */
  | { kind: "ignored" }
  /** Something between the cached state and this update is missing. */
  | { kind: "gap" };

/**
 * Applies one compact committed update. Only the next revision can be
 * applied; anything further ahead means an event was missed and the cache
 * must be resynchronized from a snapshot before it is trusted again.
 */
export function applyGameUpdate(current: GameSnapshot | undefined, update: GameUpdate): UpdateResult {
  if (!current) return { kind: "gap" };
  if (current.id !== update.id || update.revision <= current.revision) return { kind: "ignored" };
  if (update.revision !== current.revision + 1) return { kind: "gap" };
  const { move, ...live } = update;
  if (move ? move.ply !== current.ply + 1 || update.ply !== move.ply : update.ply !== current.ply) {
    return { kind: "gap" };
  }
  return {
    kind: "applied",
    game: { ...current, ...live, moves: move ? [...current.moves, move] : current.moves },
  };
}

const receivedAtBySnapshot = new WeakMap<GameSnapshot, number>();

/** Records when this state reached the browser, to anchor local clock interpolation. */
export function stampSnapshotReceived(snapshot: GameSnapshot): GameSnapshot {
  if (!receivedAtBySnapshot.has(snapshot)) receivedAtBySnapshot.set(snapshot, Date.now());
  return snapshot;
}

/** Keeps the clock anchor when a change (presence) does not carry new clock readings. */
export function carryReceivedAt(from: GameSnapshot, to: GameSnapshot): GameSnapshot {
  const at = receivedAtBySnapshot.get(from);
  if (at !== undefined && !receivedAtBySnapshot.has(to)) receivedAtBySnapshot.set(to, at);
  return to;
}

/** Browser time the state arrived; falls back to the server's reading time. */
export function getSnapshotReceivedAt(snapshot: GameSnapshot): number {
  return receivedAtBySnapshot.get(snapshot) ?? snapshot.clocks.serverTime;
}
