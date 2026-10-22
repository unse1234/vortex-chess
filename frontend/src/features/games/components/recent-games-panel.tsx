"use client";

import { useHydrated } from "@/hooks/use-hydrated";

import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Panel } from "@/components/layout/panel";
import { AppLink } from "@/components/ui/app-link";
import { ChessKnightIcon, TrophyIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { RecentGameRow } from "@/features/games/components/recent-game-row";
import { useRecentGamesQuery } from "@/features/games/hooks/use-recent-games-query";
import { useNow } from "@/hooks/use-now";

const RECENT_GAMES_LIMIT = 3;

export function RecentGamesPanel({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const {
    data: games,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
  } = useRecentGamesQuery(RECENT_GAMES_LIMIT);
  const now = useNow();

  return (
    <Panel
      title="Recent Games"
      icon={<TrophyIcon />}
      busy={!hydrated || isPending}
      className={className}
      action={
        <AppLink
          href={routes.games}
          destinationLabel="Game history"
          className="rounded px-1 text-[14px] text-fg-muted transition-colors hover:text-fg"
        >
          View All
        </AppLink>
      }
    >
      {!hydrated || isPending ? (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: RECENT_GAMES_LIMIT }, (_, index) => (
            <li
              key={index}
              className="flex h-[62px] items-center gap-3 rounded-md bg-surface-raised px-3"
            >
              <Skeleton className="size-9" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="ml-auto h-6 w-16" />
              <Skeleton className="ml-auto h-4 w-20" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <ErrorState
          title="Couldn't load recent games"
          message={error.message}
          onRetry={() => refetch()}
          retrying={isRefetching}
        />
      ) : games.length === 0 ? (
        <EmptyState
          icon={<ChessKnightIcon />}
          title="No games yet"
          description="Your finished games will show up here. Find a player or challenge a friend to get started."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((game) => (
            <li key={game.id}>
              <RecentGameRow game={game} now={now} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
