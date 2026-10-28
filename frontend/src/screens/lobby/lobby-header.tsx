"use client";

import { useState } from "react";
import { ConnectionStatus } from "@/components/display/connection-status";
import { AppLink } from "@/components/ui/app-link";
import { IconButton } from "@/components/ui/button";
import { GroupIcon, PowerIcon, SettingsIcon } from "@/components/ui/icons";
import { env } from "@/config/env";
import { routes } from "@/config/routes";
import { AccountSummary } from "@/features/auth/components/account-summary";
import { useSessionQuery } from "@/features/auth/hooks/use-session-query";
import { AccountRatings } from "@/features/ratings/components/account-ratings";
import { SignOutDialog } from "@/features/auth/components/sign-out-dialog";
import { NotificationsPopover } from "@/features/notifications/components/notifications-popover";
import { AudioSettings } from "@/features/audio/components/audio-settings";
import { useApiLatency } from "@/hooks/use-api-latency";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNavigateOrPreview } from "@/hooks/use-navigate-or-preview";
import {
  LOBBY_FRIEND_SEARCH_ID,
  useLobbyInteractions,
} from "@/screens/lobby/lobby-interactions";

export function LobbyHeader() {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { setSocialDrawerOpen } = useLobbyInteractions();
  const { navigate } = useNavigateOrPreview();
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const latency = useApiLatency();
  const { data: account } = useSessionQuery();

  function openCommunity() {
    // The sidebar is always visible on desktop; elsewhere it opens as a drawer.
    if (isDesktop) document.getElementById(LOBBY_FRIEND_SEARCH_ID)?.focus();
    else setSocialDrawerOpen(true);
  }

  return (
    <header className="relative z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[#161b26] bg-chrome px-3 py-3 sm:min-h-(--vc-header-height) sm:px-[18px]">
      <AccountSummary>{account ? <AccountRatings accountId={account.id} /> : null}</AccountSummary>

      <div
        role="group"
        aria-label="Launcher controls"
        className="ml-auto flex items-center gap-0 sm:gap-2 lg:gap-4 xl:gap-5 xl:pr-5"
      >
        <IconButton
          label="Friends and chat"
          icon={<GroupIcon />}
          onClick={openCommunity}
        />
        <NotificationsPopover />
        <AudioSettings />
        <AppLink href={routes.settings} destinationLabel="Settings" className="flex flex-col items-center rounded-md px-1 text-fg-muted">
          <SettingsIcon className="text-[24px]" />
        </AppLink>
        <ConnectionStatus
          state={latency.isPending ? "checking" : latency.isError ? "unreachable" : "connected"}
          latencyMs={latency.data?.latencyMs}
          region={latency.data?.region}
          mocked={env.apiMocking}
        />
        <IconButton
          label="Exit"
          icon={<PowerIcon />}
          onClick={() => setSignOutOpen(true)}
          aria-haspopup="dialog"
        />
      </div>

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onSignedOut={() => navigate(routes.signIn)}
        previewNotice={
          env.apiMocking
            ? "Preview build: sign-in is simulated. Return with email haseeb@vortex.io and any 8+ character password."
            : undefined
        }
      />
    </header>
  );
}
