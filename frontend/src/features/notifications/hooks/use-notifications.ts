"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PERSONAL_CHANNEL } from "@/lib/realtime/realtime-contract";
import { useRealtimeClient } from "@/lib/realtime/realtime-context";
import {
  inboxQueryOptions,
  notificationKeys,
  unreadCountQueryOptions,
} from "@/features/notifications/queries/notification.queries";
import {
  insertNotification,
  markRead,
  patchInvitation,
  type Inbox,
} from "@/features/notifications/realtime/reconcile-notifications";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/services/notifications.service";
import type {
  NotificationItem,
  NotificationRealtimeEvent,
} from "@/features/notifications/types/notification.types";

export function useNotificationsInbox() {
  return useInfiniteQuery(inboxQueryOptions());
}

export function useUnreadCount() {
  return useQuery(unreadCountQueryOptions());
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: ({ notification, unreadCount }) => {
      queryClient.setQueryData<Inbox>(notificationKeys.inbox(), (inbox) =>
        inbox ? markRead(inbox, [notification.id], notification.readAt ?? new Date().toISOString()) : inbox,
      );
      queryClient.setQueryData(notificationKeys.unread(), unreadCount);
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData<Inbox>(notificationKeys.inbox(), (inbox) =>
        inbox ? markRead(inbox, "all", new Date().toISOString()) : inbox,
      );
      queryClient.setQueryData(notificationKeys.unread(), unreadCount);
    },
  });
}

/** Ids already presented in this tab, so a repeated delivery never toasts twice. */
const presented = new Set<string>();

/**
 * Reconciles personal-channel events into the inbox and unread count, and
 * calls `onNotification` once per new entry. After a reconnect the inbox is
 * refetched, recovering anything delivered while disconnected.
 */
export function useNotificationsRealtime(onNotification?: (notification: NotificationItem) => void) {
  const queryClient = useQueryClient();
  const realtime = useRealtimeClient();
  const callback = useRef(onNotification);
  useEffect(() => {
    callback.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    if (!realtime) return;
    const unsubscribe = realtime.subscribe(PERSONAL_CHANNEL, (event) => {
      const typed = event as unknown as NotificationRealtimeEvent;
      if (typed.type === "notification.created") {
        const { notification, unreadCount } = typed.payload;
        // A concurrent authoritative inbox refresh may already include this
        // just-created row. Presentation dedupes deliveries, not HTTP reads.
        const fresh = !presented.has(notification.id);
        presented.add(notification.id);
        queryClient.setQueryData<Inbox>(notificationKeys.inbox(), (inbox) =>
          inbox ? insertNotification(inbox, notification) : inbox,
        );
        queryClient.setQueryData(notificationKeys.unread(), unreadCount);
        if (fresh) callback.current?.(notification);
      } else if (typed.type === "notification.read") {
        const { ids, all, unreadCount } = typed.payload;
        queryClient.setQueryData<Inbox>(notificationKeys.inbox(), (inbox) =>
          inbox ? markRead(inbox, all ? "all" : ids, new Date().toISOString()) : inbox,
        );
        queryClient.setQueryData(notificationKeys.unread(), unreadCount);
      } else if (typed.type === "invitation.updated" && typed.payload.invitation) {
        const invitation = typed.payload.invitation;
        queryClient.setQueryData<Inbox>(notificationKeys.inbox(), (inbox) =>
          inbox ? patchInvitation(inbox, invitation) : inbox,
        );
      }
    });
    let previous = realtime.getStatus();
    const unsubscribeStatus = realtime.onStatusChange((status) => {
      if (status === "connected" && previous !== "connected")
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      previous = status;
    });
    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [realtime, queryClient]);
}
