import { Avatar } from "@/components/display/avatar";
import { AppLink } from "@/components/ui/app-link";
import { ChevronRightIcon, DiamondIcon } from "@/components/ui/icons";
import { routes } from "@/config/routes";
import { GameResultBadge } from "@/features/games/components/game-result-badge";
import type { RecentGame } from "@/features/games/types/recent-game.types";
import { ComingSoon } from "@/components/display/coming-soon";
import { formatRelativeTime } from "@/utils/format-relative-time";

const resultSentence = { win: "Won against", loss: "Lost to", draw: "Drew with", aborted: "Aborted game against" } as const;

export function RecentGameRow({ game, now }: { game: RecentGame; now: number | null }) {
  const { viewer, opponent } = game;
  const playedAgo = now === null ? null : formatRelativeTime(game.endedAt, now);

  return (
    <AppLink
      href={routes.game(game.id)}
      destinationLabel="Game records"
      aria-label={`${resultSentence[game.result]} ${opponent.username}${playedAgo ? `, ${playedAgo}` : ""}. View game`}
      className="group grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-md bg-surface-raised px-3 py-3 text-left transition-colors hover:bg-surface-hover sm:min-h-[62px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)_auto_auto] sm:py-0"
    >
      <span className="hidden min-w-0 items-center gap-3 sm:flex">
        <Avatar src={viewer.avatarUrl} name={viewer.username} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-fg">{viewer.username}</span>
          <span className="block text-[13px] text-fg-muted">You</span>
        </span>
      </span>

      <span className="order-2 sm:order-none">
        <GameResultBadge result={game.result} />
      </span>

      <span className="order-1 flex min-w-0 items-center gap-3 sm:order-none sm:pl-4">
        <Avatar src={opponent.avatarUrl} name={opponent.username} size={36} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-fg">{opponent.username}</span>
          <span
            className="flex flex-wrap items-center gap-1 text-[13px] text-fg-muted"
          >
            <DiamondIcon className="text-[13px]" />
            <ComingSoon feature="ratings" />
            {playedAgo ? <span className="ml-1 text-fg-subtle sm:hidden">· {playedAgo}</span> : null}
          </span>
        </span>
      </span>

      <span className="hidden whitespace-nowrap text-right text-[13px] text-fg-muted sm:block">
        {playedAgo}
      </span>
      <ChevronRightIcon className="order-3 text-lg text-fg-subtle transition-transform group-hover:translate-x-0.5 sm:order-none" />
    </AppLink>
  );
}
