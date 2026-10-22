import type { GameResult } from "@/features/games/types/recent-game.types";
import { cn } from "@/utils/cn";

const resultStyles: Record<GameResult, { label: string; className: string }> = {
  win: { label: "Won", className: "border-success-line bg-success-soft text-success" },
  loss: { label: "Lost", className: "border-danger-line bg-danger-soft text-danger" },
  draw: { label: "Draw", className: "border-line-strong bg-surface-hover text-fg-muted" },
};

export function GameResultBadge({ result }: { result: GameResult }) {
  const { label, className } = resultStyles[result];
  return (
    <span
      className={cn(
        "inline-flex h-[26px] min-w-16 items-center justify-center rounded-[4px] border px-3 text-[13px] font-bold uppercase tracking-[0.06em]",
        className,
      )}
    >
      {label}
    </span>
  );
}
