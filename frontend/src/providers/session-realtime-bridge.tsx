"use client";

import { useCallback, useEffect, useRef } from "react";
import { useToast } from "@/components/feedback/toast";
import { useInvitationsRealtime } from "@/features/invitations/hooks/use-invitations";
import { useNotificationsRealtime } from "@/features/notifications/hooks/use-notifications";
import { describeNotification } from "@/features/notifications/notification-text";
import type { NotificationItem } from "@/features/notifications/types/notification.types";
import { useAudio } from "@/features/audio/audio-provider";
import { shouldSoundNotification } from "@/features/notifications/notification-audio";
import { useRealtimeClient } from "@/lib/realtime/realtime-context";
import { useQueryClient } from "@tanstack/react-query";
import { features } from "@/config/capabilities";
import { useSocialRealtime } from "@/features/social/hooks/use-social";
import { notificationKeys } from "@/features/notifications/queries/notification.queries";
import { presentNotificationOnce } from "@/features/notifications/services/notification-presentation";

/**
 * Personal-channel coordination for the signed-in session, mounted once
 * beneath the shared providers so route changes never duplicate listeners.
 * A toast only presents the saved notification; it never navigates, so a
 * player in a match is not interrupted.
 */
export function SessionRealtimeBridge() {
  const showToast = useToast();
  const { playOnce } = useAudio();
  const subscribedAt = useRef(Infinity);
  const realtime = useRealtimeClient();
  const queryClient = useQueryClient();
  const reloadNotifications = useCallback(() => {
    void queryClient.cancelQueries({ queryKey: notificationKeys.all }).then(() => queryClient.invalidateQueries({ queryKey: notificationKeys.all }));
  }, [queryClient]);
  useSocialRealtime(features.friends.available, reloadNotifications);
  useEffect(() => {
    subscribedAt.current = Date.now();
    const unsubscribe = realtime?.onStatusChange((status) => {
      subscribedAt.current = status === "connected" ? Date.now() : Infinity;
    });
    const visibility = () => {
      subscribedAt.current = document.visibilityState === "visible" ? Date.now() : Infinity;
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [realtime]);
  const onNotification = useCallback(
    (notification: NotificationItem) => {
      if (!shouldSoundNotification(notification, subscribedAt.current)) return;
      void presentNotificationOnce(notification.id, () => {
        const text = describeNotification(notification);
        if (realtime?.getStatus() === "connected") playOnce("notification", `notification:${notification.id}`);
        showToast({ key: notification.id, title: text.title, description: text.description,
          action: text.href ? { label: text.actionLabel, href: text.href } : undefined,
        });
      });
    },
    [showToast, playOnce, realtime],
  );
  useNotificationsRealtime(onNotification);
  useInvitationsRealtime();
  return null;
}
