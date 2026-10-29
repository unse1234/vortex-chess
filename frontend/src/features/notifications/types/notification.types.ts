import type { TimeControl } from "@/types/time-control.types";
import type { UserSummary } from "@/types/user-summary.types";

/** The invitation fields an inbox entry presents; always the current state. */
export type NotificationInvitation = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  expiresAt: string;
  room: {
    id: string;
    timeControl: TimeControl;
    availability: "open" | "full" | "closed" | "joined";
  };
  viewer: { role: "sender" | "recipient" };
};

export type NotificationType = "invitation.received" | "invitation.accepted" | "invitation.declined" | "friend.request.received" | "friend.request.accepted";

export type NotificationItem = {
  /** Stable across deliveries; duplicates are recognised by it. */
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  actor: UserSummary | null;
  invitation: NotificationInvitation | null;
  roomId: string | null;
  friendRequest?: { id: string; state: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" } | null;
};

export type NotificationPage = {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
};

export type NotificationRealtimeEvent =
  | { type: "notification.created"; payload: { notification: NotificationItem; unreadCount: number } }
  | { type: "notification.read"; payload: { ids: string[]; all: boolean; unreadCount: number } }
  | { type: "invitation.updated"; payload: { invitation: NotificationInvitation | null } };
