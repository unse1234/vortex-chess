import { appConfig } from "@/config/app";
import { RecentGamesPanel } from "@/features/games/components/recent-games-panel";
import { HeroTagline } from "@/features/lobby/components/hero-tagline";
import { LauncherBackdrop } from "@/features/lobby/components/launcher-backdrop";
import { QuickMatchPanel } from "@/features/lobby/components/quick-match-panel";
import { SeasonBadge } from "@/features/lobby/components/season-badge";
import { LobbyActions } from "@/screens/lobby/lobby-actions";
import { LobbyHeader } from "@/screens/lobby/lobby-header";
import { LobbyInteractionsProvider } from "@/screens/lobby/lobby-interactions";
import { LobbyInviteDialog } from "@/screens/lobby/lobby-invite-dialog";
import { LobbySocialPanel } from "@/screens/lobby/lobby-social-panel";

/** Launcher/home composition: account header, game entry points and social sidebar. */
export function LobbyScreen() {
  return (
    <LobbyInteractionsProvider>
      <LobbyHeader />

      <div className="flex flex-1 xl:min-h-0">
        <main id="main-content" tabIndex={-1} className="relative min-w-0 flex-1 focus:outline-none xl:overflow-y-auto">
          <div className="relative flex min-h-full flex-col px-4 pb-6 pt-5 sm:px-6 lg:px-10 lg:pt-[26px]">
            <LauncherBackdrop />
            <h1 className="sr-only">{appConfig.name} launcher</h1>

            <div className="relative flex min-h-[300px] flex-1 flex-col md:min-h-[360px]">
              <SeasonBadge />
              <div className="absolute bottom-4 right-1 text-[40px] sm:right-4 md:bottom-auto md:right-[6%] md:top-6 md:text-[54px] xl:right-[7%] xl:text-[64px]">
                <HeroTagline />
              </div>
            </div>

            <div className="relative mt-6 flex flex-col gap-6 md:gap-[27px]">
              <LobbyActions />
              <div className="grid gap-6 lg:grid-cols-[1.42fr_1fr] lg:gap-[26px]">
                <RecentGamesPanel />
                <QuickMatchPanel />
              </div>
            </div>
          </div>
        </main>

        <LobbySocialPanel />
      </div>

      <LobbyInviteDialog />
    </LobbyInteractionsProvider>
  );
}
