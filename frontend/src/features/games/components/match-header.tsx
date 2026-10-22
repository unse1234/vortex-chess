"use client";

import { ComingSoon } from "@/components/display/coming-soon";
import { EqualizerIcon, ServerIcon, VisibilityIcon } from "@/components/ui/icons";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import { formatTimeControl } from "@/utils/format-time-control";
import { cn } from "@/utils/cn";

/** Match summary strip: ranked status, time control, region and latency, audience. */
export function MatchHeader({ latencyMs }: { latencyMs: number | undefined }) {
  const { game, connection } = useGameSession();

  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2">
      <p className="flex items-center gap-[12px] rounded-[4px] bg-[#252a35] px-[15px] py-[6px] sm:px-[15px]">
        <span aria-hidden className={cn("size-[8px] rounded-full", game.status.phase === "finished" ? "bg-auth-dim" : "bg-auth-primary")} />
        <span className="font-display text-[17px] font-bold uppercase leading-6 text-auth-primary sm:text-[20px]">
          Casual Duel
        </span>
        <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-auth-label">
          {formatTimeControl(game.timeControl)}
        </span>
      </p>

      <p className="flex items-center gap-[8px] font-mono text-[14px] font-bold tracking-[0.08em] text-auth-label">
        <ServerIcon aria-hidden className="text-[20px] text-auth-primary" />
        {game.region}
        <span className={cn(latencyMs === undefined && "text-auth-dim", latencyMs !== undefined && "text-auth-primary")}>
          ({latencyMs === undefined ? "--" : latencyMs}ms)
        </span>
      </p>

      <span aria-hidden className="hidden size-[4px] rounded-full bg-[#3d4b43] sm:block" />
      <p className="flex items-center gap-[8px] font-mono text-[14px] font-bold tracking-[0.08em] text-auth-label">
        <VisibilityIcon aria-hidden className="text-[20px] text-[#cbccff]" />
        Spectating <ComingSoon feature="spectating" />
      </p>

      {connection === "reconnecting" || connection === "resyncing" ? (
        <p className="flex items-center gap-[8px] font-mono text-[12px] font-bold tracking-[0.1em] text-auth-amber" role="status">
          <EqualizerIcon aria-hidden className="animate-pulse text-[18px]" />
          {connection === "reconnecting" ? "RECONNECTING…" : "RESYNCING…"}
        </p>
      ) : null}
    </div>
  );
}
