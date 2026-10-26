"use client";

import { useState, type ReactNode } from "react";
import { TabList, TabPanel, type TabItem } from "@/components/ui/tabs";
import { AnalysisPanel } from "@/features/games/components/analysis/analysis-panel";
import { GameBoard } from "@/features/games/components/board/game-board";
import { GameControls } from "@/features/games/components/controls/game-controls";
import { GameFooter } from "@/features/games/components/game-footer";
import { MatchHeader } from "@/features/games/components/match-header";
import { MoveList } from "@/features/games/components/moves/move-list";
import { PlayerCard } from "@/features/games/components/players/player-card";
import { useGameSession } from "@/features/games/providers/game-session-provider";
import { VoiceToggleButton } from "@/features/social/components/voice-toggle-button";
import { useApiLatency } from "@/hooks/use-api-latency";
import { useBoardFit } from "@/screens/games/use-board-fit";
import { useRegisterLeaveGuard } from "@/screens/shells/arena-leave-guard";
import { cn } from "@/utils/cn";

type SidePanel = "moves" | "analysis";

const sidePanelTabs: readonly TabItem<SidePanel>[] = [
  { value: "moves", label: "Moves" },
  { value: "analysis", label: "Analysis", feature: "analysis" },
];

const TABS_ID = "arena-panels";
/** Desktop side column (move list), and the gap between it and the board. */
const SIDE_COLUMN = 340;
const COLUMN_GAP = 20;
/** Board frame padding and status line height, matching GameBoard. */
const FRAME_PADDING = 6;
const STATUS_HEIGHT = 30;
const MAX_BOARD = 720;

/**
 * Below the desktop breakpoint the side panels share one tabbed area; on
 * desktop they all show. Every panel stays mounted either way, so switching
 * tabs never resets scroll position.
 */
function SidePanelSlot({ panel, active, className, children }: { panel: SidePanel; active: SidePanel; className?: string; children: ReactNode }) {
  return (
    <TabPanel
      idPrefix={TABS_ID}
      value={panel}
      className={cn(panel === active ? "flex" : "hidden", "min-h-0 flex-col xl:flex", className)}
    >
      {children}
    </TabPanel>
  );
}

/**
 * Arena composition: match strip, the board beside a compact column of
 * players and moves, and the footer. One grid, two arrangements: narrow
 * screens stack players around the board with panels underneath; wide
 * screens put the top player, move list and bottom player beside the board. The board is the largest square that
 * fits both the width and the height left by the surrounding rows.
 */
export function GameLayout() {
  const { game, orientation } = useGameSession();
  const latency = useApiLatency();
  const [activePanel, setActivePanel] = useState<SidePanel>("moves");
  const { areaRef, wide, boardSize, frameHeight } = useBoardFit({
    sideWidth: SIDE_COLUMN + COLUMN_GAP,
    framePadding: FRAME_PADDING,
    statusHeight: STATUS_HEIGHT,
    maxSize: MAX_BOARD,
  });

  useRegisterLeaveGuard(game.viewer.role === "player" && game.status.phase === "in-progress");

  const bottomColor = orientation === "white" ? "w" : "b";
  const topColor = bottomColor === "w" ? "b" : "w";
  // On wide screens the grid is exactly as tall as the board frame, so the
  // players sit level with the board's top and bottom edges.
  const fitted = wide && boardSize !== null && frameHeight !== null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pb-3 pt-[6px] xl:px-5">
        <MatchHeader latencyMs={latency.data?.latencyMs} />
        <div className="flex flex-wrap items-center justify-end gap-[8px] sm:gap-[10px]">
          <VoiceToggleButton />
          <GameControls />
        </div>
      </div>

      <main
        ref={areaRef}
        id="main-content"
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col px-4 pb-4 focus:outline-none xl:items-center xl:justify-center xl:px-5 xl:pb-3"
      >
        <h1 className="sr-only">
          {game.players.w.username} versus {game.players.b.username}
        </h1>

        <div
          className="grid w-full grid-cols-1 gap-2 [grid-template-areas:'top'_'board'_'bottom'_'side'] xl:w-auto xl:grid-cols-[auto_340px] xl:grid-rows-[auto_minmax(0,1fr)_auto] xl:gap-x-5 xl:gap-y-2 xl:[grid-template-areas:'board_top'_'board_side'_'board_bottom']"
          style={fitted ? { height: frameHeight } : undefined}
        >
          <div className="[grid-area:top]">
            <PlayerCard color={topColor} />
          </div>
          <div className="[grid-area:board]" style={fitted ? { width: boardSize + 2 * FRAME_PADDING } : undefined}>
            <GameBoard boardSize={boardSize} />
          </div>
          <div className="[grid-area:bottom]">
            <PlayerCard color={bottomColor} />
          </div>

          <div className="mt-2 flex min-h-0 flex-col gap-[12px] [grid-area:side] xl:mt-0">
            <TabList
              items={sidePanelTabs}
              value={activePanel}
              onValueChange={setActivePanel}
              idPrefix={TABS_ID}
              label="Game panels"
              className="shrink-0 rounded-[10px] bg-[#161b25] xl:hidden [&>button]:py-3"
            />
            <SidePanelSlot panel="moves" active={activePanel} className="max-xl:min-h-[320px] xl:flex-1">
              <MoveList />
            </SidePanelSlot>
            {/* On wide screens the move list's own "Engine analysis" note stands in for this placeholder. */}
            <SidePanelSlot panel="analysis" active={activePanel} className="xl:!hidden">
              <AnalysisPanel />
            </SidePanelSlot>
          </div>
        </div>
      </main>

      <GameFooter />
    </div>
  );
}
