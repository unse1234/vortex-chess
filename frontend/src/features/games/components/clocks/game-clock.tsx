"use client";

import { useGameClock } from "@/features/games/hooks/use-game-clock";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { Color } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";
import { formatClock } from "@/utils/format-time-control";

const LOW_TIME_MS = 10_000;

/**
 * One side's clock. It owns its own ticking, so a tick re-renders this box
 * only — never the board, move list or chat.
 */
export function GameClock({ color, own, recordedMs }: { color: Color; own: boolean; recordedMs?: number }) {
  const { game, receivedAt } = useGameSession();
  const running = recordedMs === undefined && game.clocks.runningSide === color && game.status.phase === "in-progress";
  const remaining = useGameClock({
    remainingMs: recordedMs ?? game.clocks.remainingMs[color],
    running,
    receivedAt,
  });

  const low = running && remaining < LOW_TIME_MS;
  const name = color === "w" ? "White" : "Black";

  return (
    <div
      role="timer"
      aria-label={`${name} clock${recordedMs !== undefined ? ", recorded" : running ? ", running" : ""}`}
      className={cn(
        "flex h-[54px] w-[100px] shrink-0 flex-col items-center justify-center rounded-[6px] bg-[#252a35] sm:h-[62px] sm:w-[124px] xl:h-[52px]",
        running && own && "bg-[#21423e]",
      )}
    >
      <span
        className={cn(
          "font-display text-[12px] font-medium uppercase leading-none tracking-[0.12em]",
          running ? (own ? "text-auth-primary" : "text-[#c1d1c6]") : "text-[#909c97]",
        )}
      >
        {recordedMs !== undefined ? "Recorded" : "Clock"}
      </span>
      <span
        className={cn(
          "mt-[4px] font-mono text-[24px] font-bold leading-none tracking-[0.02em] tabular-nums sm:mt-[5px] sm:text-[32px] xl:mt-[3px] xl:text-[28px]",
          low ? "text-danger" : running ? (own ? "text-auth-primary" : "text-auth-amber") : "text-[#a3aeaa]",
        )}
      >
        {formatClock(remaining)}
      </span>
    </div>
  );
}
