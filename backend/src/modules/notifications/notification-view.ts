import type { Prisma } from '../../generated/prisma/client';
import { playerProfile, type PlayerProfile } from '../users/users.service';
import {
  invitationInclude,
  toInvitationView,
  type InvitationView,
} from '../invitations/invitation-view';

export const notificationInclude = {
  actor: { select: { id: true, username: true } },
  invitation: { include: invitationInclude },
} satisfies Prisma.NotificationInclude;
export type NotificationWithRelations = Prisma.NotificationGetPayload<{
  include: typeof notificationInclude;
}>;

const types = {
  INVITATION_RECEIVED: 'invitation.received',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_DECLINED: 'invitation.declined',
} as const;

export type NotificationView = {
  /** Stable across deliveries; clients deduplicate inbox entries and toasts by it. */
  id: string;
  type: (typeof types)[keyof typeof types];
  createdAt: string;
  readAt: string | null;
  actor: PlayerProfile | null;
  /** Current invitation state, as seen by the notification's owner. */
  invitation: InvitationView | null;
  roomId: string | null;
};

export function toNotificationView(
  notification: NotificationWithRelations,
  now = new Date(),
): NotificationView {
  return {
    id: notification.id,
    type: types[notification.type],
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    actor: notification.actor ? playerProfile(notification.actor) : null,
    invitation: notification.invitation
      ? toInvitationView(notification.invitation, notification.recipientId, now)
      : null,
    roomId: notification.roomId,
  };
}
