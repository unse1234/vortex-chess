"use client";
import Link from "next/link";
import { routes } from "@/config/routes";
import { features } from "@/config/capabilities";
import { useRatings } from "@/features/ratings/hooks/use-ratings";
export function AccountRatings({ accountId }: { accountId: string }) {
  const query = useRatings(accountId);
  if (!features.ratings.available) return null;
  if (query.isError)
    return (
      <button
        type="button"
        className="text-xs text-fg-muted"
        onClick={() => void query.refetch()}
      >
        Ratings unavailable · Retry
      </button>
    );
  if (!query.data)
    return (
      <p className="text-xs text-fg-muted" aria-busy="true">
        Loading ratings...
      </p>
    );
  return (
    <Link
      href={routes.leaderboard}
      aria-label="Your ratings and leaderboard"
      className="grid grid-cols-3 gap-3 rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-center text-xs"
    >
      {query.data.items.map((profile) => (
        <span key={profile.pool}>
          <span className="block capitalize text-fg-muted">{profile.pool}</span>
          <strong className="block font-mono text-sm">{profile.rating}</strong>
          <span className="text-[10px] text-fg-subtle">
            {profile.provisional
              ? `Provisional ${profile.games}/10`
              : `${profile.games} games`}
          </span>
        </span>
      ))}
    </Link>
  );
}
