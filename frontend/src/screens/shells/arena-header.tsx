"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PersonIcon } from "@/components/ui/icons";
import { appConfig } from "@/config/app";
import { routes } from "@/config/routes";
import { useApiLatency } from "@/hooks/use-api-latency";
import { AppLink } from "@/components/ui/app-link";
import { useLeaveGuardRef } from "@/screens/shells/arena-leave-guard";
import { cn } from "@/utils/cn";

const navButton =
  "rounded-[6px] px-[15px] py-[8px] font-body text-[16px] transition-colors sm:text-[18px]";

/** Arena top bar: brand, section navigation, connection reading and profile. */
export function ArenaHeader() {
  const router = useRouter();
  const guardRef = useLeaveGuardRef();
  const latency = useApiLatency();
  const [leaveOpen, setLeaveOpen] = useState(false);

  function leaveToLobby() {
    // A game in progress keeps running while the player is away, so ask first.
    if (guardRef.current) setLeaveOpen(true);
    else router.push(routes.play);
  }

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 px-4 sm:h-[70px] xl:h-[60px] xl:px-5">
      <div className="flex min-w-0 items-center gap-[10px] sm:gap-[18px]">
        <button type="button" onClick={leaveToLobby} className="flex shrink-0 items-center gap-[7px] rounded">
          <span aria-hidden className="size-[16px] bg-auth-primary" />
          <span className="font-display text-[18px] font-semibold uppercase tracking-[0.02em] text-[#e9eefd] sm:text-[22px]">
            {appConfig.name}
          </span>
        </button>
        <span aria-hidden className="hidden h-[16px] w-px bg-[#2c3340] lg:block" />
        <nav aria-label="Arena sections" className="hidden items-center gap-[10px] lg:flex">
          <button
            type="button"
            aria-current="page"
            onClick={leaveToLobby}
            className={cn(navButton, "bg-auth-primary-strong text-[#064e3b]")}
          >
            Arena
          </button>
          <AppLink href={routes.telemetry} destinationLabel="Telemetry" className={cn(navButton, "text-auth-label hover:text-auth-text")}>
            Telemetry
          </AppLink>
          <AppLink href={routes.leaderboard} destinationLabel="Leaderboard" className={cn(navButton, "text-auth-label hover:text-auth-text")}>
            Leaderboard
          </AppLink>
          <AppLink href={routes.games} destinationLabel="Archives" className={cn(navButton, "text-auth-label hover:text-auth-text")}>
            Archives
          </AppLink>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-[15px]">
        <p
          className="flex items-center gap-[7px] rounded-[4px] bg-[#171c26] px-[10px] py-[4px] font-mono text-[13px] font-bold tracking-[0.04em] text-auth-primary"
          aria-label={latency.data ? `Latency ${latency.data.latencyMs} milliseconds` : "Latency unknown"}
        >
          <span
            aria-hidden
            className={cn("size-[8px] rounded-full", latency.isError ? "bg-auth-danger" : latency.data ? "bg-auth-primary" : "bg-auth-dim animate-pulse")}
          />
          {latency.data ? `${latency.data.latencyMs}ms` : "--"}
        </p>
        <AppLink
          href={routes.profile}
          destinationLabel="Profile"
          aria-label="Profile"
          className="flex min-h-[40px] flex-col items-center justify-center rounded-[10px] bg-[#1b202a] text-[22px] text-auth-label transition-[filter] hover:brightness-110"
        >
          <PersonIcon aria-hidden />
        </AppLink>
      </div>

      <Dialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Leave the arena?"
        description="Your game continues and your clock keeps running while you're away."
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveOpen(false)} data-autofocus>
              Stay in the game
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setLeaveOpen(false);
                router.push(routes.play);
              }}
            >
              Leave to lobby
            </Button>
          </>
        }
      >
        <p className="px-5 py-4 text-[13px] leading-relaxed text-fg-muted">
          Open this game again at any time to rejoin it.
        </p>
      </Dialog>
    </header>
  );
}
