"use client";
import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { useGameHistoryQuery } from "@/features/games/hooks/use-game-history-query";
import type { HistoryFilters } from "@/features/games/types/game-history.types";
import { useHydrated } from "@/hooks/use-hydrated";
import { formatTimeControl } from "@/utils/format-time-control";

export function GameHistoryScreen() {
  const hydrated = useHydrated();
  const account = useSessionQuery();
  const [filters, setFilters] = useState<HistoryFilters>({ limit: 20 });
  const query = useGameHistoryQuery(account.data?.id, filters);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <main
      id="main-content"
      className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8 sm:px-8"
    >
      <Link
        href={routes.play}
        className="mb-4 inline-block text-sm text-fg-muted hover:text-fg"
      >
        ← Back to lobby
      </Link>
      <h1 className="font-display text-3xl font-semibold">Game history</h1>
      <p className="mt-2 text-fg-muted">
        Your finished games, newest first. Open a game to replay or analyze
        manually.
      </p>
      <div className="my-5 flex flex-wrap gap-4">
        <label>
          Side{" "}
          <select
            className="ml-2 rounded bg-surface-raised p-2"
            value={filters.side ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                side: (e.target.value || undefined) as HistoryFilters["side"],
              })
            }
          >
            <option value="">Both</option>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <label>
          Result{" "}
          <select
            className="ml-2 rounded bg-surface-raised p-2"
            value={filters.result ?? ""}
            onChange={(e) =>
              setFilters({
                ...filters,
                result: (e.target.value ||
                  undefined) as HistoryFilters["result"],
              })
            }
          >
            <option value="">All</option>
            <option value="win">Win</option>
            <option value="loss">Loss</option>
            <option value="draw">Draw</option>
          </select>
        </label>
      </div>
      {!hydrated || query.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : query.isError && !query.data ? (
        <ErrorState
          title="Couldn't load game history"
          message={query.error.message}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No finished games"
          description="Finished matches will appear here. Try another filter or invite a friend."
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((game) => (
              <li key={game.id}>
                <Link
                  href={routes.game(game.id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-raised p-4 transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0">
                    <strong className="block break-all">
                      {game.opponent.username}
                    </strong>
                    <time
                      dateTime={game.endedAt}
                      className="text-sm text-fg-muted"
                    >
                      {new Date(game.endedAt).toLocaleString()}
                    </time>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {game.side === "w" ? "White" : "Black"} · Friends ·{" "}
                    {formatTimeControl(game.timeControl)}
                  </span>
                  <span className="font-semibold capitalize">
                    {game.result} → Replay
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {query.isError ? (
            <ErrorState
              title="Couldn't load the next page"
              message={query.error.message}
              onRetry={() => void query.fetchNextPage()}
              retrying={query.isFetching}
            />
          ) : null}
          {query.hasNextPage ? (
            <Button
              className="mt-5"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more games"}
            </Button>
          ) : null}
        </>
      )}
    </main>
  );
}
