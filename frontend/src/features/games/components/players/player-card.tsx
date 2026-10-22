"use client";

import { ComingSoon } from "@/components/display/coming-soon";

import { Avatar } from "@/components/display/avatar";
import { RobotIcon } from "@/components/ui/icons";
import { GameClock } from "@/features/games/components/clocks/game-clock";
import { CapturedPieces } from "@/features/games/components/players/captured-pieces";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { Color } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

type TurnReadout = { label: string; detail: string; tone: "own" | "opponent" | "standby" };

function describeTurn(
  color: Color,
  game: ReturnType<typeof useGameSession>["game"],
): TurnReadout {
  if (game.status.phase === "finished") {
    const { outcome } = game.status.result;
    const won = (outcome === "white" && color === "w") || (outcome === "black" && color === "b");
    const text = outcome === "draw" ? "Draw" : won ? "Winner" : "Defeated";
    return { label: "Final", detail: text, tone: "standby" };
  }

  const toMove = game.status.turn === color;
  const own = game.viewer.color === color;
  if (!toMove) return { label: "Standby", detail: "Waiting for opponent", tone: "standby" };
  if (own) return { label: "Your turn", detail: "Targeting lock active", tone: "own" };
  if (game.players[color].kind === "bot") return { label: "Awaiting ply", detail: "Calculating…", tone: "opponent" };
  return { label: game.viewer.role === "player" ? "Opponent's turn" : "To move", detail: "Thinking…", tone: "opponent" };
}

function playerTitle(own: boolean, spectating: boolean, kind: "human" | "bot") {
  if (kind === "bot") return "BOT";
  return own && !spectating ? "YOU" : null;
}

/** A player's strip: identity, rating, captures, whose turn it is, and their clock. */
export function PlayerCard({ color }: { color: Color }) {
  const { game } = useGameSession();
  const player = game.players[color];
  const own = game.viewer.color === color;
  const readout = describeTurn(color, game);
  const opponentColor: Color = color === "w" ? "b" : "w";
  const title = playerTitle(own, game.viewer.role === "spectator", player.kind);

  return (
    <div className="@container flex items-center gap-[12px] rounded-[10px] bg-[#161b25] px-[12px] py-[12px] sm:gap-[15px] sm:px-[15px]">
      <span className="relative shrink-0">
        {player.kind === "bot" ? (
          <span className="flex size-[46px] items-center justify-center rounded-[10px] bg-[#252a35] text-[30px] text-auth-amber sm:size-[60px] sm:text-[36px]">
            <RobotIcon aria-hidden />
          </span>
        ) : player.avatarUrl ? (
          <Avatar src={player.avatarUrl} name={player.username} size={60} className="[&_img]:rounded-[10px] max-sm:!size-[46px]" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "flex size-[46px] items-center justify-center rounded-[10px] font-display text-[22px] font-medium sm:size-[60px] sm:text-[30px]",
              own ? "bg-auth-primary-strong text-[#06402a]" : "bg-[#252a35] text-auth-label",
            )}
          >
            {player.username.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            "absolute -bottom-[3px] -right-[3px] size-[18px] rounded-full border-[3px] border-[#161b25]",
            readout.tone === "standby" ? "bg-auth-dim" : own ? "bg-auth-primary" : "bg-auth-amber",
          )}
        />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-[8px]">
          <span className="truncate font-display text-[18px] font-medium leading-6 text-[#e9eefd] sm:text-[20px]">
            {player.username}
          </span>
          {title ? (
            <span
              className={cn(
                "shrink-0 rounded-[3px] px-[7px] py-[1px] font-mono text-[12px] font-bold leading-[18px] tracking-[0.06em]",
                own ? "bg-[#21423e] text-auth-primary" : "hidden bg-[#303540] text-auth-label @min-[470px]:block",
              )}
            >
              {player.kind === "bot" ? "BOT" : title}
            </span>
          ) : null}
        </p>
        <p className="mt-[4px] flex flex-wrap items-center gap-x-[8px] gap-y-1 font-mono text-[13px] font-bold tracking-[0.04em]">
          <span>Ratings</span><ComingSoon feature="ratings" />
          {game.captured[color].length > 0 ? (
            <>
              <span aria-hidden className="size-[4px] rounded-full bg-[#3d4b43]" />
              <CapturedPieces pieces={game.captured[color]} capturedColor={opponentColor} />
            </>
          ) : null}
        </p>
      </div>

      <div className="hidden shrink-0 text-right @min-[500px]:block">
        <p
          className={cn(
            "flex items-center justify-end gap-[6px] font-display text-[13px] font-medium uppercase tracking-[0.1em]",
            readout.tone === "own" ? "text-auth-primary" : readout.tone === "opponent" ? "text-auth-label" : "text-auth-dim",
          )}
        >
          {readout.tone === "own" ? <span aria-hidden className="size-[6px] rounded-full bg-auth-primary" /> : null}
          {readout.label}
        </p>
        <p
          className={cn(
            "mt-[2px] font-body text-[14px]",
            readout.tone === "opponent" ? "text-auth-amber" : readout.tone === "own" ? "text-auth-label" : "text-auth-dim",
          )}
        >
          {readout.detail}
        </p>
      </div>

      <GameClock color={color} own={own} />
    </div>
  );
}
