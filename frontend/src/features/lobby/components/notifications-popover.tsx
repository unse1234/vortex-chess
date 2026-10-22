"use client";

import { EmptyState } from "@/components/feedback/empty-state";
import { IconButton } from "@/components/ui/button";
import { BellIcon, MailIcon } from "@/components/ui/icons";
import { Popover } from "@/components/ui/popover";

/**
 * Inbox entry point. Notifications have no service yet, so the panel states
 * that plainly instead of showing an unread indicator.
 */
export function NotificationsPopover() {
  return (
    <Popover
      label="Notifications"
      trigger={(props) => <IconButton {...props} label="Notifications" icon={<MailIcon />} />}
    >
      <p className="text-sm font-semibold text-fg">Notifications</p>
      <EmptyState
        icon={<BellIcon />}
        title="You're all caught up"
        description="Game invitations will appear here once notifications are connected."
        className="pb-2"
      />
    </Popover>
  );
}
