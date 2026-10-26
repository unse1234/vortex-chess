"use client";

import { appConfig } from "@/config/app";
import { useGameSession } from "@/features/games/providers/game-session-provider";

const SYSTEM_STATE = {
  live: "SYSTEM READY",
  connecting: "CONNECTING",
  polling: "OFFLINE // READ-ONLY",
  reconnecting: "RECONNECTING",
  resyncing: "RESYNCING",
} as const;

/** Bottom status line: connection state, the engine in play, and ranked status. */
export function GameFooter() {
  const { connection, game } = useGameSession();
  const engine = game.players.w.kind === "engine" ? game.players.w : game.players.b.kind === "engine" ? game.players.b : null;

  return (
    <footer className="flex min-h-[50px] shrink-0 xl:min-h-[34px] xl:py-2 flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-[#090f19] px-5 py-3 font-display text-[12px] tracking-[0.06em] sm:text-[13px]">
      <p className="flex flex-wrap gap-x-[20px] gap-y-1 text-[#cbdbcf]">
        <span>
          {SYSTEM_STATE[connection]}
        </span>
        {engine ? <span>ENGINE // {engine.username.toUpperCase()}</span> : null}
      </p>
      <p className="text-[#92a196]">{appConfig.name.toUpperCase()}</p>
    </footer>
  );
}
