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

function MoveCell({ move, viewed, onSelect }: { move: GameMove | null; viewed: boolean; onSelect: (ply: number) => void }) {
  if (!move) return <span />;
  return (
    <button
      type="button"
      onClick={() => onSelect(move.ply)}
      aria-current={viewed ? "step" : undefined}
      aria-label={`Show the position after ${Math.ceil(move.ply / 2)}${move.ply % 2 ? "." : "..."} ${move.san}`}
      className={cn(
        "justify-self-start rounded-[3px] px-[5px] text-left transition-colors hover:bg-[#2a3140]",
        viewed && "bg-[#2b4a45] text-[#eaedfd]",
      )}
    >
      {move.san}
    </button>
  );
}

const navButton =
  "h-[30px] rounded-[4px] bg-[#1b202a] px-[10px] font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-auth-label transition-colors hover:bg-[#222834] hover:text-auth-text disabled:opacity-40";

/**
 * Move notation as the server recorded it, one row per full move. Selecting a
 * move reviews that position locally; the live game, its clocks and new moves
 * carry on untouched until Back to Live.
 */
export function MoveList() {
  const { game, reviewPly, setReviewPly } = useGameSession();
  const showToast = useToast();
  const listRef = useRef<HTMLOListElement>(null);
  const rows = toMoveRows(game.moves);
  const viewedPly = reviewPly ?? game.ply;

  // Keep the newest move in view while following the live game.
  useEffect(() => {
    const list = listRef.current;
    if (list && reviewPly === null) list.scrollTop = list.scrollHeight;
  }, [game.ply, reviewPly]);

  const select = (ply: number) => setReviewPly(ply >= game.ply ? null : ply);

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(game.pgn ?? formatMovetext(game.moves));
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
            const current = row.number === Math.ceil(viewedPly / 2);
            return (
              <li
                key={row.number}
                className={cn(
                  "grid h-[35px] shrink-0 grid-cols-[62px_minmax(0,1fr)_minmax(0,1fr)] items-center rounded-[4px] bg-[#1b202a] px-[5px] font-mono text-[15px] text-auth-text",
                  current && "bg-[#1e3837]",
                )}
              >
                <span className={cn("pl-[5px] text-[14px]", current ? "font-bold text-auth-primary" : "text-[#c5d5c9]")}>
                  {row.number}.
                </span>
                <MoveCell move={row.white} viewed={row.white?.ply === viewedPly} onSelect={select} />
                <MoveCell move={row.black} viewed={row.black?.ply === viewedPly} onSelect={select} />
              </li>
            );
          })}
        </ol>
      )}

      <nav aria-label="Review moves" className="mt-3 flex flex-wrap items-center gap-[6px]">
        <button type="button" className={navButton} disabled={viewedPly === 0} onClick={() => select(0)}>
          Start
        </button>
        <button type="button" className={navButton} disabled={viewedPly === 0} onClick={() => select(viewedPly - 1)}>
          Prev
        </button>
        <button type="button" className={navButton} disabled={reviewPly === null} onClick={() => select(viewedPly + 1)}>
          Next
        </button>
        {reviewPly !== null ? (
          <button
            type="button"
            onClick={() => setReviewPly(null)}
            className={cn(navButton, "ml-auto bg-[#21423e] text-auth-primary hover:bg-[#28524c] hover:text-auth-primary")}
          >
            Back to live{game.ply - reviewPly > 0 ? ` (+${game.ply - reviewPly})` : ""}
          </button>
        ) : null}
      </nav>

      <footer className="mt-3 flex items-center gap-2 text-sm text-auth-label">Engine analysis <ComingSoon feature="analysis" /></footer>
    </section>
  );
}
