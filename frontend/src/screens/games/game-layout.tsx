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
import { MatchChatPanel } from "@/features/social/components/match-chat-panel";
import { VoicePanel } from "@/features/social/components/voice-panel";
import { VoiceToggleButton } from "@/features/social/components/voice-toggle-button";
import { useApiLatency } from "@/hooks/use-api-latency";
import { useRegisterLeaveGuard } from "@/screens/shells/arena-leave-guard";
import { cn } from "@/utils/cn";

type SidePanel = "moves" | "analysis" | "chat" | "voice";

const sidePanelTabs: readonly TabItem<SidePanel>[] = [
  { value: "moves", label: "Moves" },
  { value: "analysis", label: "Analysis", feature: "analysis" },
  { value: "chat", label: "Chat", feature: "chat" },
  { value: "voice", label: "Voice", feature: "voice" },
];

const TABS_ID = "arena-panels";

/**
 * Below the desktop breakpoint the side panels share one tabbed area; on
 * desktop they all show. Every panel stays mounted either way, so switching
 * tabs never resets scroll position or drafts.
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

/** Arena composition: match strip, three columns (analysis + moves, board, voice + chat) and footer. */
export function GameLayout() {
  const { game, orientation } = useGameSession();
  const latency = useApiLatency();
  const [activePanel, setActivePanel] = useState<SidePanel>("moves");

  useRegisterLeaveGuard(game.viewer.role === "player" && game.status.phase === "in-progress");

  const bottomColor = orientation === "white" ? "w" : "b";
  const topColor = bottomColor === "w" ? "b" : "w";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pb-[16px] pt-[10px] xl:px-5 xl:pb-[25px]">
        <MatchHeader latencyMs={latency.data?.latencyMs} />
        <div className="flex flex-wrap items-center justify-end gap-[8px] sm:gap-[10px]">
          <VoiceToggleButton />
          <GameControls />
        </div>
      </div>

      <main
        id="main-content"
        tabIndex={-1}
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 px-4 pb-4 focus:outline-none xl:grid-cols-[382px_minmax(0,1fr)_382px] xl:grid-rows-[minmax(0,1fr)] xl:gap-0 xl:px-[15px] xl:pb-[15px]"
      >
        <h1 className="sr-only">
          {game.players.w.username} versus {game.players.b.username}
        </h1>

        <div className="order-2 flex min-h-0 flex-col gap-[15px] xl:order-none">
          <TabList
            items={sidePanelTabs}
            value={activePanel}
            onValueChange={setActivePanel}
            idPrefix={TABS_ID}
            label="Game panels"
            className="shrink-0 rounded-[10px] bg-[#161b25] xl:hidden [&>button]:py-3"
          />
          <SidePanelSlot panel="analysis" active={activePanel}>
            <AnalysisPanel />
          </SidePanelSlot>
          <SidePanelSlot panel="moves" active={activePanel} className="max-xl:min-h-[320px] xl:flex-1">
            <MoveList />
          </SidePanelSlot>
        </div>

        <div className="order-1 mx-auto flex min-h-0 w-full max-w-[675px] flex-col gap-[10px] xl:order-none xl:max-w-[min(675px,max(410px,calc(100dvh-450px)))] xl:justify-start">
          <PlayerCard color={topColor} />
          <GameBoard />
          <PlayerCard color={bottomColor} />
        </div>

        <div className="order-3 flex min-h-0 flex-col gap-[15px] xl:order-none">
          <SidePanelSlot panel="voice" active={activePanel}>
            <VoicePanel />
          </SidePanelSlot>
          <SidePanelSlot panel="chat" active={activePanel} className="max-xl:min-h-[380px] xl:flex-1">
            <MatchChatPanel />
          </SidePanelSlot>
        </div>
      </main>

      <GameFooter />
    </div>
  );
}
