"use client";

import Link from "next/link";
import { ArrowBackIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { Avatar } from "@/components/display/avatar";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { useHydrated } from "@/hooks/use-hydrated";
import { NotificationsPopover } from "@/features/notifications/components/notifications-popover";
import { cn } from "@/utils/cn";

export type LiveState = "live" | "polling" | "reconnecting";

const liveText: Record<LiveState, { label: string; className: string }> = {
  live: { label: "Live", className: "text-success" },
  polling: { label: "Refreshing", className: "text-fg-subtle" },
  reconnecting: { label: "Reconnecting…", className: "text-accent animate-pulse" },
};

/** Compact platform header for room and invitation screens. */
export function RoomPageHeader({ live }: { live?: LiveState }) {
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[#161b26] bg-chrome px-3 sm:px-[18px]">
      <Link
        href={routes.play}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[14px] font-semibold text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        <ArrowBackIcon aria-hidden className="text-lg" />
        Lobby
      </Link>
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        {live ? (
          <span role="status" className={cn("flex items-center gap-1.5 text-[13px] font-semibold", liveText[live].className)}>
            <span aria-hidden className="size-2 rounded-full bg-current" />
            {liveText[live].label}
          </span>
        ) : null}
        <NotificationsPopover />
        <SignedInAs />
      </div>
    </header>
  );
}

function SignedInAs() {
  const hydrated = useHydrated();
  const { data: account } = useSessionQuery();
  if (!hydrated || !account) return null;
  return (
    <span className="hidden items-center gap-2 text-[14px] font-semibold text-fg sm:flex">
      <Avatar src={account.avatarUrl} name={account.username} size={30} />
      <span className="max-w-40 truncate">{account.username}</span>
    </span>
  );
}
