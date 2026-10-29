import type { NotificationItem } from "@/features/notifications/types/notification.types";

/** Realtime notification freshness; reconnect/history reads never call this. */
export function shouldSoundNotification(item: NotificationItem, subscribedAt: number, now = Date.now()) {
  const createdAt = Date.parse(item.createdAt);
  return !item.readAt && Number.isFinite(createdAt) && createdAt >= subscribedAt &&
    now - createdAt >= -2_000 && now - createdAt <= 5_000 &&
    (item.type !== "friend.request.received" || item.friendRequest?.state === "PENDING") &&
    (item.type !== "invitation.received" ||
      (item.invitation?.status === "pending" && Date.parse(item.invitation.expiresAt) > now));
}
