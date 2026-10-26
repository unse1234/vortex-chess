import type { GameConnection } from "@/features/games/providers/game-session-provider";
import type { PendingCommand } from "@/features/games/types/game-command.types";
import { currentEngineTurn } from "@/features/games/realtime/reconcile-game-snapshot";
import type { GameSnapshot } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

type StatusTone = "active" | "idle" | "warning";

function describeOutcome(game: GameSnapshot & { status: { phase: "finished" } }) {
  const { outcome, reason } = game.status.result;
  const side = outcome === "draw" ? "DRAW" : outcome === "aborted" ? "ABORTED" : `${outcome.toUpperCase()} WINS`;
  return `${side} // ${reason.replace(/-/g, " ").toUpperCase()}`;
}

/** Plain-language status line shown under the board, derived from the state and connection. */
export function describeBoardStatus(
  game: GameSnapshot,
  connection: GameConnection,
  pending: PendingCommand | null,
  reviewPly: number | null,
): { left: string; right: string; tone: StatusTone } {
  if (reviewPly !== null) {
    const behind = game.ply - reviewPly;
    return {
      // Move-number notation: "12." is White's twelfth move, "12..." Black's reply.
      left: reviewPly === 0 ? "REVIEWING START" : `REVIEWING ${Math.ceil(reviewPly / 2)}${reviewPly % 2 ? "." : "..."}`,
      right: `${behind} NEWER MOVE${behind === 1 ? "" : "S"} // BOARD READ-ONLY`,
      tone: "warning",
    };
  }
  if (game.status.phase === "finished") {
    return {
      left: "GAME COMPLETE",
      right: describeOutcome(game as GameSnapshot & { status: { phase: "finished" } }),
      tone: "idle",
    };
  }
  if (connection === "reconnecting") {
    return { left: "CONNECTION LOST", right: "CLOCKS RUNNING // RECONNECTING", tone: "warning" };
  }
  if (connection === "resyncing") {
    return { left: "SYNCHRONIZING", right: "FETCHING LATEST POSITION", tone: "warning" };
  }
  if (connection === "connecting" || connection === "polling") {
    return { left: "CONNECTING", right: "MOVES OPEN ONCE CONNECTED", tone: "warning" };
  }

  const turn = game.status.turn;
  const mover = game.players[turn];
  const left = `${turn === "w" ? "WHITE" : "BLACK"} IN COMBAT`;
  const prefix = `MOVE ${Math.floor(game.ply / 2) + 1} //`;

  if (pending?.status === "uncertain") return { left, right: `${prefix} CONFIRMING WITH SERVER`, tone: "warning" };
  if (pending) return { left, right: `${prefix} TRANSMITTING`, tone: "active" };
  if (game.viewer.color === turn) return { left, right: `${prefix} AWAITING YOUR MOVE`, tone: "active" };
  if (mover.kind === "engine") {
    const engineTurn = currentEngineTurn(game);
    if (engineTurn?.phase === "retrying")
      return { left, right: `${prefix} ENGINE UNREACHABLE // RETRY ${engineTurn.attempt}`, tone: "warning" };
    if (engineTurn?.phase === "queued") return { left, right: `${prefix} ENGINE QUEUED`, tone: "active" };
    return { left, right: `${prefix} ENGINE THINKING`, tone: "active" };
  }
  return { left, right: `${prefix} AWAITING OPPONENT`, tone: "active" };
}

const dotClasses: Record<StatusTone, string> = {
  active: "bg-auth-primary",
  idle: "bg-auth-dim",
  warning: "bg-auth-amber",
};

const textClasses: Record<StatusTone, string> = {
  active: "text-auth-primary",
  idle: "text-auth-muted",
  warning: "text-auth-amber",
};

export function BoardStatus({
  left,
  right,
  tone,
}: {
  left: string;
  right: string;
  tone: StatusTone;
}) {
  return (
    <p
      aria-live="polite"
      className="flex h-[30px] items-end justify-between gap-3 px-1 pb-[3px] font-mono text-[11px] font-bold tracking-[0.08em] @min-[520px]:text-[13px] @min-[520px]:tracking-[0.14em]"
    >
      <span className={cn("flex items-center gap-[8px] whitespace-nowrap", textClasses[tone])}>
        <span aria-hidden className={cn("size-[6px] rounded-full", dotClasses[tone])} />
        {left}
      </span>
      <span className="min-w-0 truncate text-right text-auth-label">{right}</span>
    </p>
  );
}
