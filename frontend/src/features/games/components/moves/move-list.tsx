"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/feedback/toast";
import { EmptyState } from "@/components/feedback/empty-state";
import { CopyIcon, DescriptionIcon } from "@/components/ui/icons";
import { ComingSoon } from "@/components/display/coming-soon";
import { formatMovetext, toMoveRows } from "@/features/games/pgn";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { GameMove } from "@/features/games/types/game.types";
import { cn } from "@/utils/cn";

function MoveCell({ move, current }: { move: GameMove | null; current: boolean }) {
  if (!move) return <span />;
  return <span className={cn(current && "text-[#eaedfd]")}>{move.san}</span>;
}

/** Move notation as the server produced it, one row per full move. */
export function MoveList() {
  const { game } = useGameSession();
  const showToast = useToast();
  const listRef = useRef<HTMLOListElement>(null);
  const rows = toMoveRows(game.moves);
  const lastPly = game.moves.at(-1)?.ply ?? 0;

  // Keep the newest move in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastPly]);

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(formatMovetext(game.moves));
      showToast({ title: "PGN copied", description: "The move list is on your clipboard." });
    } catch {
      showToast({ title: "Couldn't copy the PGN", description: "Your browser blocked clipboard access." });
    }
  }

  return (
    <section
      aria-label="Move list"
      className="flex min-h-0 flex-1 flex-col rounded-[12px] bg-[#161b25] px-[15px] pb-[14px] pt-[16px]"
    >
      <header className="flex items-center justify-between gap-2 px-[2px]">
        <h2 className="flex items-center gap-[8px] font-display text-[19px] font-medium uppercase leading-6 text-[#eaeefe]">
          <DescriptionIcon aria-hidden className="text-[22px] text-auth-primary" />
          PGN Transmission Log
        </h2>
        <button
          type="button"
          onClick={copyPgn}
          disabled={game.moves.length === 0}
          className="flex items-center gap-[6px] rounded px-1 font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-auth-label transition-colors hover:text-auth-text disabled:opacity-40"
        >
          <CopyIcon aria-hidden className="text-[16px]" />
          Copy
        </button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No moves yet"
          description="Moves appear here as they're played."
          className="my-auto"
        />
      ) : (
        <ol ref={listRef} className="mt-[14px] flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto pr-[2px]">
          {rows.map((row) => {
            const current = row.number === Math.ceil(lastPly / 2);
            return (
              <li
                key={row.number}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "grid h-[35px] shrink-0 grid-cols-[62px_minmax(0,1fr)_minmax(0,1fr)] items-center rounded-[4px] bg-[#1b202a] px-[5px] font-mono text-[15px] text-auth-text",
                  current && "bg-[#1e3837]",
                )}
              >
                <span className={cn("pl-[5px] text-[14px]", current ? "font-bold text-auth-primary" : "text-[#c5d5c9]")}>
                  {row.number}.
                </span>
                <MoveCell move={row.white} current={current} />
                <MoveCell move={row.black} current={current} />
              </li>
            );
          })}
        </ol>
      )}

      <footer className="mt-3 flex items-center gap-2 text-sm text-auth-label">Engine analysis <ComingSoon feature="analysis" /></footer>
    </section>
  );
}
