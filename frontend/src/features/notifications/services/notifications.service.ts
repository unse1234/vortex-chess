import { httpClient } from "@/lib/http/browser-client";
import type { NotificationItem, NotificationPage } from "@/features/notifications/types/notification.types";

export const NOTIFICATION_PAGE_SIZE = 10;

export async function getNotifications(cursor?: string, signal?: AbortSignal): Promise<NotificationPage> {
  const { data } = await httpClient.get<NotificationPage>("/notifications", {
    params: { limit: NOTIFICATION_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    signal,
  });
  return data;
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  const { data } = await httpClient.get<{ unreadCount: number }>("/notifications/unread-count", { signal });
  return data.unreadCount;
}

/** Marks the entry read only; it never answers the invitation it refers to. */
export async function markNotificationRead(id: string) {
  const { data } = await httpClient.post<{ notification: NotificationItem; unreadCount: number }>(
    `/notifications/${encodeURIComponent(id)}/read`,
  );
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await httpClient.post<{ unreadCount: number }>("/notifications/read-all");
  return data;
}
