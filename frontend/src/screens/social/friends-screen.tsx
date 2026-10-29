"use client";
import { useState } from "react";
import Link from "next/link";
import { routes } from "@/config/routes";
import { TabList, TabPanel, type TabItem } from "@/components/ui/tabs";
import { NotificationsPopover } from "@/features/notifications/components/notifications-popover";
import {
  ManagedFriendsList,
  FriendRequestsList,
  FindPlayersList,
  BlockedAccountsList,
} from "@/features/social/components/social-lists";
import { useSocialConnection } from "@/features/social/hooks/use-social";

type SocialTab = "friends" | "incoming" | "sent" | "find";
const tabs: readonly TabItem<SocialTab>[] = [
  { value: "friends", label: "Friends" },
  { value: "incoming", label: "Incoming Requests" },
  { value: "sent", label: "Sent Requests" },
  { value: "find", label: "Find Players" },
];
export function FriendsScreen({ blocked = false }: { blocked?: boolean }) {
  const [tab, setTab] = useState<SocialTab>("friends");
  const connection = useSocialConnection();
  return (
    <main
      id="main-content"
      className="flex-1 overflow-y-auto px-4 py-8 sm:px-8"
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href={routes.play}
            className="text-sm text-fg-muted hover:text-accent"
          >
            Back to lobby
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href={blocked ? routes.friends : routes.blockedAccounts}
              className="text-sm text-accent hover:underline"
            >
              {blocked
                ? "Manage friends"
                : "Privacy settings: blocked accounts"}
            </Link>
            <NotificationsPopover />
          </div>
        </div>
        <p className="mt-8 text-xs uppercase tracking-widest text-accent">
          Vortix Chess {blocked ? "· Privacy settings" : "· Your community"}
        </p>
        <h1 className="mt-2 text-3xl font-bold">
          {blocked ? "Blocked accounts" : "Friends"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-fg-muted">
          {blocked
            ? "Only accounts you blocked appear here. Unblocking does not restore old relationships."
            : "Connect by username, see your friends online, and invite them to a casual game."}
        </p>
        {connection !== "connected" ? (
          <p
            role="status"
            className="mt-4 rounded-md border border-line-strong p-3 text-sm text-fg-muted"
          >
            Reconnecting... Friends and requests refresh automatically when the
            connection returns.
          </p>
        ) : null}
        <section
          className="mt-6 rounded-lg border border-line-strong bg-surface p-4 sm:p-6"
          aria-label={blocked ? "Blocked accounts" : "Friend management"}
        >
          {blocked ? (
            <BlockedAccountsList />
          ) : (
            <>
              <TabList
                items={tabs}
                value={tab}
                onValueChange={setTab}
                idPrefix="friends-management"
                label="Friends sections"
                className="mb-6 overflow-x-auto border-b border-line [&_button]:min-w-28 [&_button]:px-2 [&_button]:text-xs"
              />
              <TabPanel idPrefix="friends-management" value={tab} key={tab}>
                {tab === "friends" ? (
                  <ManagedFriendsList />
                ) : tab === "incoming" ? (
                  <FriendRequestsList direction="incoming" />
                ) : tab === "sent" ? (
                  <FriendRequestsList direction="outgoing" />
                ) : (
                  <FindPlayersList />
                )}
              </TabPanel>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
