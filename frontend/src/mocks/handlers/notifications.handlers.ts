import { http, HttpResponse } from "msw";
import type { NotificationPage } from "@/features/notifications/types/notification.types";
import { apiPath } from "@/mocks/handlers/api-path";

/** Demo mode has no invitation backend, so the inbox is simply empty. */
export const notificationsHandlers = [
  http.get(apiPath("/notifications"), () =>
    HttpResponse.json<NotificationPage>({ items: [], nextCursor: null, unreadCount: 0 }),
  ),
  http.get(apiPath("/notifications/unread-count"), () => HttpResponse.json({ unreadCount: 0 })),
];
