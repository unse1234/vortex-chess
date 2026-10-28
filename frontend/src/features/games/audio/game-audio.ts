import type { GameMove, GameSnapshot, GameUpdate } from "@/features/games/types/game.types";

type GameCue = "gameEnd" | "check" | "promotion" | "castle" | "capture" | "moveSelf" | "moveOpponent";

type NotationMove = Pick<GameMove, "san">;

/** Exactly one effect, including for capture/check/promote combinations. No result inference. */
export function selectMoveCue(move: NotationMove, ownMove = true): GameCue {
  if (/[+#]$/.test(move.san)) return "check";
  if (move.san.includes("=")) return "promotion";
  if (/^O-O/.test(move.san)) return "castle";
  if (move.san.includes("x")) return "capture";
  return ownMove ? "moveSelf" : "moveOpponent";
}

/** Local event guard. Snapshots establish a silent boundary, never announce history. */
export class LiveGameAudio {
  private revision = 0;
  private synchronized = false;
  private offset = 0;
  private boundary = 0;

  constructor(private gameId: string, private play: (cue: GameCue, id: string) => void) {}

  sync(snapshot: GameSnapshot, now = Date.now()) {
    if (snapshot.id !== this.gameId || snapshot.revision < this.revision) return;
    this.revision = snapshot.revision;
    this.offset = now - snapshot.clocks.serverTime;
    this.synchronized = true;
  }

  pause() { this.synchronized = false; }
  discardBefore(now = Date.now()) { this.boundary = now; }

  /** Called only for updates actually accepted by the canonical revision reconciler. */
  accepted(current: GameSnapshot, update: GameUpdate, audible = true, now = Date.now()) {
    if (update.id !== this.gameId || current.id !== this.gameId || update.revision <= this.revision) return;
    const previousRevision = this.revision;
    this.revision = update.revision;
    if (!audible || !this.synchronized || current.status.phase === "finished" ||
      previousRevision !== current.revision || update.revision !== current.revision + 1 ||
      (update.move ? update.move.ply !== current.ply + 1 || update.ply !== update.move.ply : update.ply !== current.ply)) return;
    // Compare to the server clock anchored on synchronization, allowing client/server skew.
    const eventAt = update.clocks.serverTime + this.offset;
    const age = now - eventAt;
    if (eventAt < this.boundary || age > 2_000 || age < -2_000) return;
    const cue = update.status.phase === "finished" ? "gameEnd" : update.move
      ? selectMoveCue(update.move, update.move.color === update.viewer.color) : null;
    if (cue) this.play(cue, `game:${this.gameId}:${update.revision}`);
  }
}
