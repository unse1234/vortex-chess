import type { GameConnection } from "@/features/games/providers/game-session-provider";
import type { GameSnapshot } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

type StatusTone = "active" | "idle" | "warning";

function describeOutcome(game: GameSnapshot & { status: { phase: "finished" } }) {
  const { outcome, reason } = game.status.result;
  const side = outcome === "draw" ? "DRAW" : `${outcome.toUpperCase()} WINS`;
  return `${side} // ${reason.toUpperCase()}`;
}

/** Plain-language status line shown under the board, derived from the snapshot and connection. */
export function describeBoardStatus(
  game: GameSnapshot,
  connection: GameConnection,
  movePending: boolean,
): { left: string; right: string; tone: StatusTone } {
  const fullMove = Math.floor(game.moves.length / 2) + 1;

  if (game.status.phase === "finished") {
    return {
      left: "GAME COMPLETE",
      right: describeOutcome(game as GameSnapshot & { status: { phase: "finished" } }),
      tone: "idle",
    };
  }
  if (connection === "reconnecting") {
    return { left: "CONNECTION LOST", right: "MOVES PAUSED // RECONNECTING", tone: "warning" };
  }
  if (connection === "resyncing") {
    return { left: "CONNECTION RESTORED", right: "RESYNCING POSITION", tone: "warning" };
  }

  const turn = game.status.turn;
  const mover = game.players[turn];
  const left = `${turn === "w" ? "WHITE" : "BLACK"} IN COMBAT`;
  const prefix = `MOVE ${fullMove} //`;

  if (movePending) return { left, right: `${prefix} TRANSMITTING MOVE`, tone: "active" };
  if (game.viewer.color === turn) return { left, right: `${prefix} AWAITING YOUR MOVE`, tone: "active" };
  if (mover.kind === "bot") return { left, right: `${prefix} PENDING BOT RESOLUTION`, tone: "active" };
  return { left, right: `${prefix} AWAITING ${game.viewer.role === "player" ? "OPPONENT" : turn === "w" ? "WHITE" : "BLACK"}`, tone: "active" };
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
      className="flex items-center justify-between gap-3 px-1 pt-[10px] font-mono text-[11px] font-bold tracking-[0.08em] @min-[520px]:text-[13px] @min-[520px]:tracking-[0.14em]"
    >
      <span className={cn("flex items-center gap-[8px] whitespace-nowrap", textClasses[tone])}>
        <span aria-hidden className={cn("size-[6px] rounded-full", dotClasses[tone])} />
        {left}
      </span>
      <span className="text-right text-auth-label">{right}</span>
    </p>
  );
}
