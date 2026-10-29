import { routes } from "@/config/routes";
import type { NotificationItem } from "@/features/notifications/types/notification.types";
import { formatTimeControl } from "@/utils/format-time-control";

/** Presentation text and destination for one inbox entry or toast. */
export function describeNotification(notification: NotificationItem) {
  const actor = notification.actor?.username ?? "A player";
  const invitation = notification.invitation;
  const game = invitation ? formatTimeControl(invitation.room.timeControl) : null;
  switch (notification.type) {
    case "friend.request.received":
      return {
        title: `${actor} sent you a friend request`,
        description: notification.friendRequest?.state === "PENDING" ? "Review it in Incoming Requests." : "This request is no longer pending.",
        href: notification.friendRequest?.state === "PENDING" ? routes.friends : null,
        actionLabel: "View requests",
      };
    case "friend.request.accepted":
      return { title: `${actor} accepted your friend request`, description: undefined, href: routes.friends, actionLabel: "View friends" };
    case "invitation.received":
      return {
        title: `${actor} invited you to play`,
        description: game ? `Private ${game} game` : undefined,
        href: invitation ? routes.invitation(invitation.id) : null,
        actionLabel: "View invitation",
      };
    case "invitation.accepted":
      return {
        title: `${actor} accepted your invitation`,
        description: "They're in your room.",
        href: notification.roomId ? routes.room(notification.roomId) : null,
        actionLabel: "Open room",
      };
    case "invitation.declined":
      return {
        title: `${actor} declined your invitation`,
        description: game ? `${game} room` : undefined,
        href: notification.roomId ? routes.room(notification.roomId) : null,
        actionLabel: "Open room",
      };
  }
}
