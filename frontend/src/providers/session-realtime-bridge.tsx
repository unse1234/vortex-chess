"use client";

import { useCallback } from "react";
import { useToast } from "@/components/feedback/toast";
import { useInvitationsRealtime } from "@/features/invitations/hooks/use-invitations";
import { useNotificationsRealtime } from "@/features/notifications/hooks/use-notifications";
import { describeNotification } from "@/features/notifications/notification-text";
import type { NotificationItem } from "@/features/notifications/types/notification.types";

/**
 * Personal-channel coordination for the signed-in session, mounted once
 * beneath the shared providers so route changes never duplicate listeners.
 * A toast only presents the saved notification; it never navigates, so a
 * player in a match is not interrupted.
 */
export function SessionRealtimeBridge() {
  const showToast = useToast();
  const onNotification = useCallback(
    (notification: NotificationItem) => {
      const text = describeNotification(notification);
      showToast({
        key: notification.id,
        title: text.title,
        description: text.description,
        action: text.href ? { label: text.actionLabel, href: text.href } : undefined,
      });
    },
    [showToast],
  );
  useNotificationsRealtime(onNotification);
  useInvitationsRealtime();
  return null;
}
