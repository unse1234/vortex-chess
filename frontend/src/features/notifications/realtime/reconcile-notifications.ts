import type { InfiniteData } from "@tanstack/react-query";
import type {
  NotificationInvitation,
  NotificationItem,
  NotificationPage,
} from "@/features/notifications/types/notification.types";

export type Inbox = InfiniteData<NotificationPage, string | undefined>;

export function hasNotification(inbox: Inbox | undefined, id: string) {
  return !!inbox?.pages.some((page) => page.items.some((item) => item.id === id));
}

/** Prepends a delivered entry once; a repeated delivery of the same id is a no-op. */
export function insertNotification(inbox: Inbox, item: NotificationItem): Inbox {
  if (hasNotification(inbox, item.id) || inbox.pages.length === 0) return inbox;
  const [first, ...rest] = inbox.pages;
  return { ...inbox, pages: [{ ...first, items: [item, ...first.items] }, ...rest] };
}

export function markRead(inbox: Inbox, ids: readonly string[] | "all", readAt: string): Inbox {
  let changed = false;
  const pages = inbox.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.readAt || (ids !== "all" && !ids.includes(item.id))) return item;
      changed = true;
      return { ...item, readAt };
    }),
  }));
  return changed ? { ...inbox, pages } : inbox;
}

/** Entries show the invitation's current state; answered invitations never revert to pending. */
export function patchInvitation(inbox: Inbox, invitation: NotificationInvitation): Inbox {
  let changed = false;
  const pages = inbox.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.invitation?.id !== invitation.id) return item;
      if (item.invitation.status !== "pending" && invitation.status === "pending") return item;
      changed = true;
      return { ...item, invitation: { ...invitation, viewer: item.invitation.viewer } };
    }),
  }));
  return changed ? { ...inbox, pages } : inbox;
}
