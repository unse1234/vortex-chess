"use client";
import { useState } from "react";
import Link from "next/link";
import { routes } from "@/config/routes";
import { Button } from "@/components/ui/button";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { useLeaderboard } from "@/features/ratings/hooks/use-ratings";
import { RatingChangeText } from "@/components/display/rating-change";
import {
  ratingPools,
  type RatingPool,
} from "@/features/ratings/types/ratings.types";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/utils/cn";

export function LeaderboardScreen() {
  const [pool, setPool] = useState<RatingPool>("blitz");
  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto px-4 py-8 sm:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent">
              Vortix Chess · elo-v1
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
              Leaderboards
            </h1>
            <p className="mt-3 max-w-xl text-sm text-fg-muted">
              Three independent pools. Complete 10 rated games in a pool to earn
              a public position. Equal ratings share a rank.
            </p>
          </div>
          <Link
            href={routes.matchmaking()}
            className="rounded-md bg-accent px-4 py-3 text-sm font-bold text-[#1b1305]"
          >
            Play rated
          </Link>
        </div>
        <div className="my-6 flex gap-2" role="group" aria-label="Rating pool">
          {ratingPools.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={pool === item}
              className={cn(
                "rounded-md border px-5 py-3 text-sm font-semibold capitalize",
                pool === item
                  ? "border-accent bg-surface-raised text-accent"
                  : "border-line-strong text-fg-muted hover:bg-surface-hover",
              )}
              onClick={() => setPool(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <PoolLeaderboard key={pool} pool={pool} />
      </div>
    </main>
  );
}

function PoolLeaderboard({ pool }: { pool: RatingPool }) {
  const hydrated = useHydrated();
  const { data: session } = useSessionQuery();
  const [page, setPage] = useState(1);
  const { leaderboard, position, history } = useLeaderboard(
    session?.id ?? "",
    pool,
    page,
  );
  const data = leaderboard.data;
  const mine = position.data;
  const changes = history.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="space-y-6">
      <section
        aria-label="Your position"
        className="rounded-xl border border-line-strong bg-surface-raised p-5"
        aria-live="polite"
      >
        <h2 className="text-sm font-semibold text-fg-muted">Your position</h2>
        {!hydrated || position.isPending ? (
          <p className="mt-2" aria-busy="true">
            Loading your placement...
          </p>
        ) : position.isError ? (
          <ReadError
            message={position.error.message}
            retry={() => void position.refetch()}
          />
        ) : mine ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong className="text-2xl">
                {mine.status === "ranked"
                  ? `#${mine.rank}`
                  : mine.status === "provisional"
                    ? "Provisional"
                    : "Unlisted"}
              </strong>
              <p className="mt-1 text-sm text-fg-muted">
                {mine.status === "provisional"
                  ? `${mine.placementsRemaining} more settled rated games to join the ${pool} leaderboard.`
                  : mine.status === "ineligible"
                    ? "This account is not eligible for the public leaderboard."
                    : `${mine.games} rated games · Peak ${mine.peakRating}`}
              </p>
            </div>
            <p className="text-right">
              <strong className="font-mono text-3xl text-accent">
                {mine.rating}
              </strong>
              <span className="block text-sm capitalize text-fg-muted">
                {pool} rating
              </span>
            </p>
          </div>
        ) : null}
      </section>
      <section
        aria-label={`${pool} leaderboard`}
        className="overflow-hidden rounded-xl border border-line-strong bg-surface"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line-strong px-5 py-4">
          <h2 className="font-semibold capitalize">{pool} rankings</h2>
          <Button
            disabled={leaderboard.isFetching}
            onClick={() => {
              void leaderboard.refetch();
              void position.refetch();
              void history.refetch();
            }}
          >
            Refresh
          </Button>
        </div>
        {!hydrated || leaderboard.isPending ? (
          <p className="p-8 text-fg-muted" aria-busy="true">
            Loading leaderboard...
          </p>
        ) : leaderboard.isError ? (
          <div className="p-5">
            <ReadError
              message={leaderboard.error.message}
              retry={() => void leaderboard.refetch()}
            />
          </div>
        ) : !data?.items.length ? (
          <div className="p-8">
            <p className="font-semibold">
              {page === 1 ? "No placed players yet" : "No players on this page"}
            </p>
            <p className="mt-2 text-sm text-fg-muted">
              {page === 1
                ? "Be among the first to finish 10 rated games in this pool."
                : "Return to an earlier page or refresh the rankings."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                {pool} players ranked by rating; provisional players excluded
              </caption>
              <thead className="text-xs uppercase tracking-wide text-fg-muted">
                <tr>
                  <th scope="col" className="px-5 py-3">
                    Rank
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Player
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Rating
                  </th>
                  <th scope="col" className="hidden px-3 py-3 sm:table-cell">
                    W / D / L
                  </th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell">
                    Games
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr
                    key={item.user.id}
                    className={cn(
                      "border-t border-line-strong",
                      item.user.id === session?.id && "bg-surface-raised",
                    )}
                  >
                    <td className="px-5 py-4 font-mono text-accent">
                      {item.rank}
                    </td>
                    <td className="max-w-48 px-3 py-4 font-semibold">
                      <span className="block break-all">{item.user.username}{item.user.id === session?.id ? " (you)" : ""}</span>
                      <span className="mt-1 block text-xs font-normal text-fg-muted sm:hidden">
                        {item.games} games · {item.wins}/{item.draws}/{item.losses} W/D/L
                      </span>
                    </td>
                    <td className="px-3 py-4 font-mono font-bold">
                      {item.rating}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-4 text-fg-muted sm:table-cell">
                      {item.wins} / {item.draws} / {item.losses}
                    </td>
                    <td className="hidden px-5 py-4 font-mono sm:table-cell">{item.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-strong px-5 py-4 text-sm text-fg-muted">
          <span>
            Page {page}
            {data
              ? ` · ${data.total} placed players · ${data.limit} per page`
              : ""}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || leaderboard.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              disabled={
                !data ||
                page * data.limit >= data.total ||
                leaderboard.isFetching ||
                leaderboard.isError
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
      <section
        aria-label="Your rating history"
        className="rounded-xl border border-line-strong bg-surface p-5"
      >
        <h2 className="font-semibold">Your rating history</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Committed changes in the {pool} pool.
        </p>
        {!hydrated || history.isPending ? (
          <p className="mt-4" aria-busy="true">
            Loading rating history...
          </p>
        ) : history.isError && !history.data ? (
          <ReadError
            message={history.error.message}
            retry={() => void history.refetch()}
          />
        ) : changes.length === 0 ? (
          <p className="mt-4 text-sm text-fg-muted">
            No settled rated games in this pool yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line-strong">
            {changes.map((change) => (
              <li key={change.gameId}>
                <Link
                  href={routes.game(change.gameId)}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm hover:text-accent"
                >
                  <span>
                    <strong>{change.opponent.username}</strong>
                    <time
                      className="mt-1 block text-xs text-fg-muted"
                      dateTime={change.createdAt}
                    >
                      {new Date(change.createdAt).toLocaleString()}
                    </time>
                  </span>
                  <RatingChangeText change={change} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {history.isError && history.data ? (
          <ReadError
            message={history.error.message}
            retry={() => void history.fetchNextPage()}
          />
        ) : null}
        {history.hasNextPage ? (
          <Button
            className="mt-4"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? "Loading..." : "Load older changes"}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
function ReadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="mt-3 text-sm">
      <p className="text-danger">{message}</p>
      <Button className="mt-2" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
