"use client";

import Link from "next/link";
import { Avatar } from "@/components/display/avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Skeleton } from "@/components/feedback/skeleton";
import { Button, IconButton } from "@/components/ui/button";
import { BellIcon, MailIcon } from "@/components/ui/icons";
import { Popover } from "@/components/ui/popover";
import { describeNotification } from "@/features/notifications/notification-text";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsInbox,
  useUnreadCount,
} from "@/features/notifications/hooks/use-notifications";
import type { NotificationItem } from "@/features/notifications/types/notification.types";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/utils/cn";
import { formatRelativeTime } from "@/utils/format-relative-time";

const statusText: Record<NonNullable<NotificationItem["invitation"]>["status"], string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** Durable inbox. Opening or reading an entry never answers the invitation. */
export function NotificationsPopover() {
  const hydrated = useHydrated();
  const unread = useUnreadCount();
  const count = hydrated ? (unread.data ?? 0) : 0;
  return (
    <Popover
      label="Notifications"
      panelClassName="w-[min(24rem,calc(100vw-2rem))] p-0"
      trigger={(props) => (
        <IconButton
          {...props}
          label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
          icon={<MailIcon />}
          indicator={count > 0}
        />
      )}
    >
      <NotificationsPanel unreadCount={count} />
    </Popover>
  );
}

function NotificationsPanel({ unreadCount }: { unreadCount: number }) {
  const hydrated = useHydrated();
  const inbox = useNotificationsInbox();
  const markAll = useMarkAllNotificationsRead();
  const now = useNow();
  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-7rem))] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <p className="flex-1 text-sm font-semibold text-fg">Notifications</p>
        {unreadCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Mark all as read
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={!hydrated || inbox.isPending}>
        {!hydrated || inbox.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : inbox.isError ? (
          <ErrorState
            className="m-4"
            title="Couldn't load notifications"
            message={inbox.error.message}
            onRetry={() => inbox.refetch()}
            retrying={inbox.isRefetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellIcon />}
            title="You're all caught up"
            description="Game invitations and replies will appear here."
            className="pb-6"
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <NotificationRow notification={item} now={now} />
              </li>
            ))}
          </ul>
        )}
        {inbox.hasNextPage ? (
          <div className="border-t border-line p-3 text-center">
            <Button size="sm" variant="ghost" onClick={() => inbox.fetchNextPage()} disabled={inbox.isFetchingNextPage}>
              {inbox.isFetchingNextPage ? "Loading…" : "Load older notifications"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NotificationRow({ notification, now }: { notification: NotificationItem; now: number | null }) {
  const markRead = useMarkNotificationRead();
  const text = describeNotification(notification);
  const unread = notification.readAt === null;
  const markAsRead = () => {
    if (unread) markRead.mutate(notification.id);
  };
  return (
    <div className={cn("flex gap-3 px-4 py-3", unread && "bg-accent-soft/40")}>
      <Avatar src={notification.actor?.avatarUrl ?? null} name={notification.actor?.username ?? "?"} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-snug text-fg">
          {unread ? <span className="sr-only">Unread: </span> : null}
          {text.title}
        </p>
        <p className="mt-0.5 text-[12px] text-fg-subtle">
          {[text.description, notification.invitation ? statusText[notification.invitation.status] : null, now === null ? null : formatRelativeTime(notification.createdAt, now)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
          {text.href ? (
            <Link href={text.href} onClick={markAsRead} className="font-semibold text-accent hover:underline">
              {text.actionLabel}
            </Link>
          ) : null}
          {unread ? (
            <button type="button" onClick={markAsRead} disabled={markRead.isPending} className="text-fg-muted hover:text-fg">
              Mark as read
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
