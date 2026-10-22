import type { GameSnapshot } from "@/features/games/types/game.types";

/**
 * The one policy for combining snapshots, used by HTTP fetches, command
 * responses and realtime events alike: the higher revision wins, so an older
 * response arriving late can never roll the board back.
 */
export function reconcileGameSnapshot(
  current: GameSnapshot | undefined,
  incoming: GameSnapshot,
): GameSnapshot {
  if (!current || current.id !== incoming.id) return incoming;
  return incoming.revision > current.revision ? incoming : current;
}

/**
 * A realtime event that skips revisions means an update was missed, so the
 * cache can't be trusted until a fresh snapshot is fetched.
 */
export function hasRevisionGap(current: GameSnapshot | undefined, incoming: GameSnapshot): boolean {
  return current !== undefined && incoming.revision > current.revision + 1;
}

const receivedAtBySnapshot = new WeakMap<GameSnapshot, number>();

/** Records when this snapshot reached the browser, to anchor local clock interpolation. */
export function stampSnapshotReceived(snapshot: GameSnapshot): GameSnapshot {
  if (!receivedAtBySnapshot.has(snapshot)) receivedAtBySnapshot.set(snapshot, Date.now());
  return snapshot;
}

/** Browser time the snapshot arrived; falls back to the server's reading time. */
export function getSnapshotReceivedAt(snapshot: GameSnapshot): number {
  return receivedAtBySnapshot.get(snapshot) ?? snapshot.clocks.serverTime;
}
