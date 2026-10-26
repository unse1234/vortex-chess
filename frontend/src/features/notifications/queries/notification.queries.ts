import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { getNotifications, getUnreadCount } from "@/features/notifications/services/notifications.service";

export const notificationKeys = {
  all: ["notifications"] as const,
  inbox: () => [...notificationKeys.all, "inbox"] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
};

export function inboxQueryOptions() {
  return infiniteQueryOptions({
    queryKey: notificationKeys.inbox(),
    queryFn: ({ pageParam, signal }) => getNotifications(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}

export function unreadCountQueryOptions() {
  return queryOptions({
    queryKey: notificationKeys.unread(),
    queryFn: ({ signal }) => getUnreadCount(signal),
    staleTime: 60_000,
  });
}
