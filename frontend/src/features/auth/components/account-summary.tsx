"use client";

import { Avatar } from "@/components/display/avatar";
import { Skeleton } from "@/components/feedback/skeleton";
import { ErrorIcon, ShieldPlusIcon } from "@/components/ui/icons";
import { ComingSoon } from "@/components/display/coming-soon";
import { useHydrated } from "@/hooks/use-hydrated";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";

/** Header account block: avatar, name, level progress and rank. */
export function AccountSummary() {
  const hydrated = useHydrated();
  const { data: account, isPending, isError, refetch } = useSessionQuery();

  if (!hydrated || isPending) {
    return (
      <div
        className="flex items-center gap-3"
        aria-busy="true"
        aria-label="Loading account"
      >
        <Skeleton className="size-11 rounded-md sm:size-[54px]" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    );
  }

  if (isError || !account) {
    return (
      <button
        type="button"
        onClick={() => refetch()}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-fg-muted hover:bg-white/5"
      >
        <ErrorIcon className="text-lg text-danger" />
        Account unavailable — retry
      </button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-4 lg:gap-8">
      <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
        <Avatar
          src={account.avatarUrl}
          name={account.username}
          size={54}
          className="!size-11 sm:!size-[54px]"
        />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[15px] font-bold text-fg sm:text-[17px]">
            <span className="truncate">{account.username}</span>
          </p>
          <div className="mt-1 flex items-center gap-2.5 text-[12px] text-fg-muted sm:text-[13px]">
            <span>Levels / XP</span>
            <ComingSoon feature="rewards" />
          </div>
        </div>
      </div>
      <p className="hidden h-[38px] items-center gap-2.5 rounded-sm border border-[#262b38] bg-[#171b27] px-4 text-[15px] font-medium text-fg md:inline-flex">
        <ShieldPlusIcon className="text-xl text-fg-muted" />
        <span>Rank</span>
        <ComingSoon feature="ratings" />
      </p>
    </div>
  );
}
