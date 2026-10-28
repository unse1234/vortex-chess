"use client";
import {
  useId,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { RatingChangeText } from "@/components/display/rating-change";
import {
  getOccupiedSquares,
  isPromotionMove,
  parseCoordinateMove,
} from "@/features/games/board-position";
import {
  mainlineId,
  nextNode,
  originalPly,
} from "@/features/games/analysis-tree";
import { VariationList } from "@/features/games/components/analysis/variation-list";
import {
  ChessboardAdapter,
  type BoardHighlight,
} from "@/features/games/components/board/chessboard-adapter";
import { PromotionDialog } from "@/features/games/components/board/promotion-dialog";
import { GameResultDialog } from "@/features/games/components/dialogs/game-result-dialog";
import { PlayerCard } from "@/features/games/components/players/player-card";
import { useManualAnalysis } from "@/features/games/hooks/use-manual-analysis";
import { useAudio } from "@/features/audio/audio-provider";
import { selectMoveCue } from "@/features/games/audio/game-audio";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import type { PromotionPiece, Square } from "@/features/games/types/game.types";
import { useBoardFit } from "@/screens/games/use-board-fit";
import { formatClock, formatTimeControl } from "@/utils/format-time-control";

/** Shared game-specific replay/manual workspace; recorded data stays in its canonical cache. */
export function PostGameWorkspace({
  manual,
  announceResult,
}: {
  manual: boolean;
  announceResult: boolean;
}) {
  const { game, orientation, flipBoard } = useGameSession();
  const { play: playAudio } = useAudio();
  const onPlayed = useCallback((move: { san: string }) => playAudio(selectMoveCue(move)), [playAudio]);
  const analysis = useManualAnalysis(game, manual, onPlayed);
  const [resultOpen, setResultOpen] = useState(announceResult);
  const [selection, setSelection] = useState<{
    cursor: string;
    square: Square;
  } | null>(null);
  const [promotion, setPromotion] = useState<{
    cursor: string;
    from: Square;
    to: Square;
  } | null>(null);
  const [entryError, setEntryError] = useState("");
  const moveInput = useRef<HTMLInputElement>(null);
  const moveEntryId = useId();
  useLayoutEffect(() => {
    const input = moveInput.current;
    return () => {
      setSelection(null);
      setPromotion(null);
      setEntryError("");
      if (input) input.value = "";
    };
  }, []);
  const { areaRef, boardSize, wide, frameHeight } = useBoardFit({
    sideWidth: 360,
    framePadding: 6,
    statusHeight: 30,
    maxSize: 720,
  });
  const { cursor, tree, fen, position, pending } = analysis;
  const pendingDrop = analysis.pendingMove ? parseCoordinateMove(analysis.pendingMove) : null;
  function select(id: string) {
    setSelection(null);
    setPromotion(null);
    setEntryError("");
    analysis.select(id);
    if (id !== cursor) {
      const ply = originalPly(id);
      const move = ply === null ? tree[id] : ply > 0 ? game.moves[ply - 1] : null;
      if (move) onPlayed(move);
    }
  }
  const ply = originalPly(cursor);
  const interactive = manual && position !== null && !pending;
  const selected = selection?.cursor === cursor ? selection.square : null;
  const pendingPromotion = promotion?.cursor === cursor ? promotion : null;
  const occupied = getOccupiedSquares(fen);
  const highlights: Partial<Record<Square, BoardHighlight>> = {};
  const lastMove =
    ply === null ? tree[cursor] : ply > 0 ? game.moves[ply - 1] : null;
  if (lastMove) {
    const uci = lastMove.uci;
    highlights[uci.slice(0, 2) as Square] = "last-move";
    highlights[uci.slice(2, 4) as Square] = "last-move";
  }
  if (position?.checkSquare) highlights[position.checkSquare] = "check";
  if (pendingDrop) {
    highlights[pendingDrop.from] = "pending";
    highlights[pendingDrop.to] = "pending";
  }
  if (selected) {
    highlights[selected] = "selected";
    for (const target of position?.legalMoves[selected] ?? [])
      highlights[target] = occupied.has(target)
        ? "capture-target"
        : "move-target";
  }
  function play(from: Square, to: Square, piece?: PromotionPiece) {
    if (!interactive) return false;
    setSelection(null);
    setPromotion(null);
    setEntryError("");
    return analysis.play(`${from}${to}${piece ?? ""}`);
  }
  function requestMove(from: Square, to: Square) {
    if (!interactive || !position.legalMoves[from]?.includes(to)) return false;
    if (isPromotionMove(fen, from, to)) {
      setPromotion({ cursor, from, to });
      return false;
    }
    return play(from, to);
  }
  function selectSquare(square: Square) {
    if (!interactive) return;
    if (selected && position.legalMoves[selected]?.includes(square)) {
      requestMove(selected, square);
      return;
    }
    setSelection(
      position.legalMoves[square]?.length ? { cursor, square } : null,
    );
  }
  function enterMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem(
      "move",
    ) as HTMLInputElement;
    const move = parseCoordinateMove(input.value);
    if (!move) {
      setEntryError("Use a move such as e2e4 or e7e8q.");
      return;
    }
    if (isPromotionMove(fen, move.from, move.to) && !move.promotion)
      setPromotion({ cursor, from: move.from, to: move.to });
    else play(move.from, move.to, move.promotion);
    input.value = "";
  }
  const parent =
    ply === null ? tree[cursor].parentId : mainlineId(Math.max(0, ply - 1));
  const next = nextNode(game, tree, analysis.preferred, cursor);
  const recordedClocks =
    ply === null
      ? null
      : ply === 0
        ? { w: game.timeControl.initialMs, b: game.timeControl.initialMs }
        : game.moves[ply - 1].remainingMs;
  const status = game.status.phase === "finished" ? game.status.result : null;
  const bottomColor = orientation === "white" ? "w" : "b";
  const topColor = bottomColor === "w" ? "b" : "w";
  const clocks = recordedClocks ?? game.clocks.remainingMs;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 xl:px-5">
        <div>
          <h1 className="font-display text-xl font-semibold">
            {manual ? "Manual analysis" : "Original replay"}
          </h1>
          <p className="text-sm text-auth-label">
            {game.players.w.username} vs {game.players.b.username} ·{" "}
            {formatTimeControl(game.timeControl)} · {status?.outcome} /{" "}
            {status?.reason}
          </p>
          <p className="mt-1 text-sm text-auth-label">
            <span className="capitalize">{game.rating?.rated ? `Rated ${game.rating.pool}` : "Casual"}</span>
            {game.rating?.changes?.[game.viewer.color] ? <> · <RatingChangeText change={game.rating.changes[game.viewer.color]!} /></> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status ? <Button variant="ghost" onClick={() => setResultOpen(true)}>View result</Button> : null}
          <Button variant="ghost" onClick={flipBoard}>
            Flip board
          </Button>
          <Link
            className="rounded bg-surface-raised px-3 py-2"
            href={manual ? routes.game(game.id) : routes.analysis(game.id)}
          >
            {manual ? "Replay game" : "Analyze manually"}
          </Link>
          <Link className="px-3 py-2" href={routes.games}>
            History
          </Link>
        </div>
      </header>
      <main
        id="main-content"
        ref={areaRef}
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 xl:items-center xl:justify-center xl:px-5"
      >
        <div
          className="grid w-full min-w-0 grid-cols-1 gap-2 [grid-template-areas:'top'_'board'_'bottom'_'side'] xl:w-auto xl:grid-cols-[auto_340px] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:gap-x-5 xl:[grid-template-areas:'board_top'_'board_side'_'board_bottom']"
          style={wide && frameHeight ? { height: frameHeight } : undefined}
        >
          <div className="[grid-area:top]">
            <PlayerCard color={topColor} recordedMs={clocks[topColor]} />
          </div>
          <div className="[grid-area:bottom]">
            <PlayerCard color={bottomColor} recordedMs={clocks[bottomColor]} />
          </div>
          <div
            className="min-w-0 [grid-area:board]"
            style={wide && boardSize ? { width: boardSize + 12 } : undefined}
          >
            <div className="rounded-[10px] bg-[#0a0e19] p-[6px]">
              <div
                aria-label="Chess board"
                aria-busy={pending}
                className="mx-auto aspect-square w-full max-w-[560px]"
                style={
                  boardSize ? { width: boardSize, maxWidth: "none" } : undefined
                }
              >
                <ChessboardAdapter
                pendingDrop={pendingDrop}
                  fen={fen}
                  orientation={orientation}
                  highlights={highlights}
                  interactive={interactive}
                  canDragFrom={(square) =>
                    Boolean(position?.legalMoves[square]?.length)
                  }
                  onSquareSelect={selectSquare}
                  onMoveRequest={requestMove}
                  animate={false}
                />
              </div>
              <p
                aria-live="polite"
                className="flex h-[30px] items-end justify-between gap-2 px-1 font-mono text-xs text-auth-primary"
              >
                <span>
                  {ply === null
                    ? "TEMPORARY VARIATION"
                    : `ORIGINAL · PLY ${ply}`}
                </span>
                <span>
                  {pending
                    ? "VALIDATING…"
                    : manual
                      ? `${position?.turn === "b" ? "BLACK" : position ? "WHITE" : "…"} TO MOVE`
                      : "READ-ONLY"}
                </span>
              </p>
            </div>
          </div>
          <aside className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto rounded-xl bg-[#161b25] p-4 [grid-area:side] max-xl:max-h-[640px]">
            {manual ? (
              <p className="text-sm text-auth-amber">
                Unsaved — cleared when leaving
                <br />
                <span className="text-auth-label">
                  Untimed self-analysis · play both sides
                </span>
              </p>
            ) : null}
            <nav
              aria-label="Replay navigation"
              className="flex flex-wrap gap-2"
            >
              <Button
                variant="ghost"
                onClick={() => select(mainlineId(0))}
                disabled={cursor === mainlineId(0)}
              >
                First
              </Button>
              <Button
                variant="ghost"
                onClick={() => select(parent)}
                disabled={cursor === mainlineId(0)}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                onClick={() => next && select(next)}
                disabled={!next}
              >
                Next
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  let id = cursor;
                  for (;;) {
                    const child = nextNode(game, tree, analysis.preferred, id);
                    if (!child) break;
                    id = child;
                  }
                  select(id);
                }}
              >
                Last
              </Button>
            </nav>
            {manual ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelection(null);
                    setPromotion(null);
                    setEntryError("");
                    analysis.returnToOriginal();
                  }}
                >
                  Return to original line
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelection(null);
                    setPromotion(null);
                    setEntryError("");
                    analysis.discard();
                  }}
                >
                  Discard variations
                </Button>
              </div>
            ) : null}
            <VariationList
              game={game}
              tree={tree}
              cursor={cursor}
              select={select}
            />
            {manual ? (
              <form onSubmit={enterMove} className="flex gap-2">
                <label className="sr-only" htmlFor={moveEntryId}>
                  Alternative move (UCI)
                </label>
                <input
                  ref={moveInput}
                  id={moveEntryId}
                  name="move"
                  placeholder="e2e4"
                  autoComplete="off"
                  disabled={!interactive}
                  className="min-w-0 flex-1 rounded bg-auth-field-alt px-3 font-mono"
                />
                <Button type="submit" disabled={!interactive}>
                  Play move
                </Button>
              </form>
            ) : null}
            {analysis.error || entryError ? (
              <p role="alert" className="text-sm text-auth-danger">
                {analysis.error ?? entryError}{" "}
                {manual && !position ? (
                  <button onClick={analysis.retry}>Retry</button>
                ) : null}
              </p>
            ) : null}
            <p className="text-xs text-auth-label">
              {recordedClocks
                ? `Recorded clocks · White ${formatClock(recordedClocks.w)} / Black ${formatClock(recordedClocks.b)}`
                : "Temporary line is untimed · cards show original final clocks"}
            </p>
            <details className="shrink-0 text-sm">
              <summary className="cursor-pointer">Original PGN</summary>
              <textarea
                aria-label="Original PGN"
                readOnly
                value={game.pgn ?? ""}
                className="mt-2 h-24 w-full resize-none rounded bg-auth-field-alt p-2 font-mono text-xs"
              />
            </details>
          </aside>
        </div>
      </main>
      <PromotionDialog
        open={pendingPromotion !== null}
        color={position?.turn ?? "w"}
        onCancel={() => setPromotion(null)}
        onSelect={(piece) =>
          pendingPromotion &&
          play(pendingPromotion.from, pendingPromotion.to, piece)
        }
      />
      {status ? (
        <GameResultDialog
          gameId={game.id}
          open={resultOpen}
          onOpenChange={setResultOpen}
          result={status}
          viewer={game.viewer}
          rating={game.rating}
        />
      ) : null}
    </div>
  );
}
