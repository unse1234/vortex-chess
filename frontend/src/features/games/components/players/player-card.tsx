"use client";


import { Avatar } from "@/components/display/avatar";
import { RobotIcon } from "@/components/ui/icons";
import { GameClock } from "@/features/games/components/clocks/game-clock";
import { capturedByColor } from "@/features/games/board-position";
import { CapturedPieces } from "@/features/games/components/players/captured-pieces";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import { currentEngineTurn } from "@/features/games/realtime/reconcile-game-snapshot";
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
    const text = outcome === "draw" ? "Draw" : outcome === "aborted" ? "Aborted" : won ? "Winner" : "Defeated";
    return { label: "Final", detail: text, tone: "standby" };
  }

  const toMove = game.status.turn === color;
  const own = game.viewer.color === color;
  if (!toMove) return { label: "Standby", detail: "Waiting for opponent", tone: "standby" };
  if (own) return { label: "Your turn", detail: "Targeting lock active", tone: "own" };
  if (game.players[color].kind === "engine") return describeEngineTurn(currentEngineTurn(game));
  if (!game.players[color].online) return { label: "Opponent's turn", detail: "Disconnected · clock running", tone: "opponent" };
  return { label: "Opponent's turn", detail: "Thinking…", tone: "opponent" };
}

/** Only what the server reported: queued for a search slot, searching, or retrying the service. */
function describeEngineTurn(turn: ReturnType<typeof currentEngineTurn>): TurnReadout {
  if (turn?.phase === "thinking") return { label: "Engine's turn", detail: "Thinking…", tone: "opponent" };
  if (turn?.phase === "queued") return { label: "Engine's turn", detail: "Waiting for the engine…", tone: "opponent" };
  if (turn?.phase === "retrying") return { label: "Engine's turn", detail: `Reconnecting · attempt ${turn.attempt}`, tone: "opponent" };
  return { label: "Engine's turn", detail: "Clock running", tone: "opponent" };
}

function playerTitle(own: boolean, kind: "human" | "engine") {
  if (kind === "engine") return "ENGINE";
  return own ? "YOU" : null;
}

/** A player's strip: identity, rating, captures, whose turn it is, and their clock. */
export function PlayerCard({ color, recordedMs }: { color: Color; recordedMs?: number }) {
  const { game } = useGameSession();
  const player = game.players[color];
  const rating = game.rating?.snapshots[color];
  const own = game.viewer.color === color;
  const readout = describeTurn(color, game);
  const opponentColor: Color = color === "w" ? "b" : "w";
  const title = playerTitle(own, player.kind);
  const captured = capturedByColor(game.moves)[color];

  return (
    <div className="@container flex items-center gap-[12px] rounded-[10px] bg-[#161b25] px-[12px] py-[12px] sm:gap-[15px] sm:px-[15px] xl:py-[8px]">
      <span className="relative shrink-0">
        {player.kind === "engine" ? (
          <span className="flex size-[46px] items-center justify-center rounded-[10px] bg-[#252a35] text-[30px] text-auth-amber sm:size-[60px] sm:text-[36px] xl:size-[48px] xl:text-[30px]">
            <RobotIcon aria-hidden />
          </span>
        ) : player.avatarUrl ? (
          <Avatar src={player.avatarUrl} name={player.username} size={60} className="[&_img]:rounded-[10px] max-sm:!size-[46px] xl:!size-[48px]" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "flex size-[46px] items-center justify-center rounded-[10px] font-display text-[22px] font-medium sm:size-[60px] sm:text-[30px] xl:size-[48px] xl:text-[24px]",
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
              {title}
            </span>
          ) : null}
        </p>
        <p className="mt-[4px] flex flex-wrap items-center gap-x-[8px] gap-y-1 font-mono text-[13px] font-bold tracking-[0.04em]">
          {player.kind === "engine" ? <span className="text-auth-label">Engine service</span>
            : rating ? <span className="capitalize">{game.rating?.pool} {rating.rating}{rating.provisional ? " · Provisional" : ""}</span> : <span>Casual</span>}
          {captured.length > 0 ? (
            <>
              <span aria-hidden className="size-[4px] rounded-full bg-[#3d4b43]" />
              <CapturedPieces pieces={captured} capturedColor={opponentColor} />
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

      <GameClock color={color} own={own} recordedMs={recordedMs} />
    </div>
  );
}
