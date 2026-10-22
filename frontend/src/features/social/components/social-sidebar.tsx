"use client";

import { ChatBubbleIcon, GroupIcon } from "@/components/ui/icons";
import { TabList, TabPanel, type TabItem } from "@/components/ui/tabs";
import { FriendsPanel } from "@/features/social/components/friends-panel";
import { MessagesTeaser } from "@/features/social/components/messages-teaser";
import type { Friend } from "@/features/social/types/friend.types";
import { cn } from "@/utils/cn";

type SocialTab = "friends" | "chat";
const tabs: readonly TabItem<SocialTab>[] = [
  { value: "friends", label: "Friends", icon: <GroupIcon /> },
  { value: "chat", label: "Chat", icon: <ChatBubbleIcon />, feature: "chat" },
];
type SocialSidebarProps = {
  idPrefix: string;
  onInviteFriend: (friend: Friend) => void;
  searchInputId?: string;
  autoFocusSearch?: boolean;
  className?: string;
};

export function SocialSidebar({ idPrefix, onInviteFriend, searchInputId, autoFocusSearch, className }: SocialSidebarProps) {
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <TabList items={tabs} value="friends" onValueChange={() => {}} idPrefix={idPrefix} label="Social" className="shrink-0 border-b border-[#181c27]" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
        <TabPanel idPrefix={idPrefix} value="friends">
          <FriendsPanel onInviteFriend={onInviteFriend} searchInputId={searchInputId} autoFocusSearch={autoFocusSearch} />
        </TabPanel>
      </div>
      <div className="shrink-0 px-4 pb-4 pt-2"><MessagesTeaser /></div>
    </div>
  );
}
