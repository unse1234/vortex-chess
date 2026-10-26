import type { Invitation, Prisma } from '../../generated/prisma/client';
import { playerProfile, type PlayerProfile } from '../users/users.service';
import {
  isRoomOpen,
  roomInclude,
  roomSummary,
  type RoomSummary,
} from '../rooms/room-view';

export const invitationInclude = {
  sender: { select: { id: true, username: true } },
  recipient: { select: { id: true, username: true } },
  room: { include: roomInclude },
} satisfies Prisma.InvitationInclude;
export type InvitationWithRelations = Prisma.InvitationGetPayload<{
  include: typeof invitationInclude;
}>;

export type InvitationStatusView =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';
/** Whether the room can still be joined through this invitation. */
export type RoomAvailability = 'open' | 'full' | 'closed' | 'joined';

export type InvitationView = {
  id: string;
  status: InvitationStatusView;
  addressedBy: 'username' | 'email';
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  sender: PlayerProfile;
  recipient: PlayerProfile;
  room: RoomSummary & { availability: RoomAvailability };
  viewer: {
    role: 'sender' | 'recipient';
    canAccept: boolean;
    canDecline: boolean;
    canCancel: boolean;
  };
};

/** Expiry applies on read even before the sweep has persisted it. */
export function effectiveInvitationStatus(
  invitation: Pick<Invitation, 'status' | 'expiresAt'>,
  now = new Date(),
): InvitationStatusView {
  if (invitation.status === 'PENDING' && invitation.expiresAt <= now)
    return 'expired';
  return invitation.status.toLowerCase() as InvitationStatusView;
}

export function invitationRole(
  invitation: Pick<Invitation, 'senderId' | 'recipientId'>,
  userId: string,
) {
  if (invitation.senderId === userId) return 'sender' as const;
  if (invitation.recipientId === userId) return 'recipient' as const;
  return null;
}

/**
 * Viewer-specific view, or null for anyone except sender and recipient.
 * Contains no email addresses, whichever way the recipient was addressed.
 */
export function toInvitationView(
  invitation: InvitationWithRelations,
  viewerId: string,
  now = new Date(),
): InvitationView | null {
  const role = invitationRole(invitation, viewerId);
  if (!role) return null;
  const status = effectiveInvitationStatus(invitation, now);
  const room = invitation.room;
  // The seated challenger of a started room can still open it to reach the game.
  const availability: RoomAvailability =
    room.challengerId === invitation.recipientId &&
    (room.status === 'STARTED' || isRoomOpen(room, now))
      ? 'joined'
      : !isRoomOpen(room, now)
        ? 'closed'
        : room.challengerId
          ? 'full'
          : 'open';
  const pending = status === 'pending';
  return {
    id: invitation.id,
    status,
    addressedBy: invitation.addressedBy === 'EMAIL' ? 'email' : 'username',
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    respondedAt: invitation.respondedAt?.toISOString() ?? null,
    sender: playerProfile(invitation.sender),
    recipient: playerProfile(invitation.recipient),
    room: { ...roomSummary(room, now), availability },
    viewer: {
      role,
      canAccept: role === 'recipient' && pending && availability === 'open',
      canDecline: role === 'recipient' && pending,
      canCancel: role === 'sender' && pending,
    },
  };
}
