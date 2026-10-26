import type { Prisma, Room } from '../../generated/prisma/client';
import { playerProfile, type PlayerProfile } from '../users/users.service';
import { timeControlOf, type TimeControl } from './time-controls';

export const roomInclude = {
  host: { select: { id: true, username: true } },
  challenger: { select: { id: true, username: true } },
  game: { select: { id: true } },
} satisfies Prisma.RoomInclude;
export type RoomWithSeats = Prisma.RoomGetPayload<{
  include: typeof roomInclude;
}>;

export type RoomStatusView =
  | 'waiting'
  | 'ready'
  | 'started'
  | 'cancelled'
  | 'expired';
export type ColorPreferenceView = 'white' | 'black' | 'random';
export type SeatView = {
  player: PlayerProfile;
  ready: boolean;
  online: boolean;
  /** Assigned colour, or null while the host's preference is random. */
  color: 'white' | 'black' | null;
};
export type RoomView = {
  id: string;
  revision: number;
  status: RoomStatusView;
  settings: { timeControl: TimeControl; colorPreference: ColorPreferenceView };
  seats: { host: SeatView; challenger: SeatView | null };
  /** The game created when the room started; reloading the room recovers it. */
  gameId: string | null;
  expiresAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewer: {
    role: 'host' | 'challenger';
    canEditSettings: boolean;
    canInvite: boolean;
    canCancel: boolean;
    canLeave: boolean;
    canSetReady: boolean;
    /** Host only, once both players are ready. */
    canStart: boolean;
  };
};

export function isRoomOpen(
  room: Pick<Room, 'status' | 'expiresAt'>,
  now = new Date(),
) {
  return (
    (room.status === 'WAITING' || room.status === 'READY') &&
    room.expiresAt > now
  );
}

export function roomStatusView(
  room: Pick<Room, 'status' | 'expiresAt'>,
  now = new Date(),
): RoomStatusView {
  if (room.status === 'STARTED') return 'started';
  if (room.status === 'CANCELLED') return 'cancelled';
  if (room.status === 'EXPIRED' || room.expiresAt <= now) return 'expired';
  return room.status === 'READY' ? 'ready' : 'waiting';
}

export function roomRole(room: Pick<Room, 'hostId' | 'challengerId'>, userId: string) {
  if (room.hostId === userId) return 'host' as const;
  if (room.challengerId === userId) return 'challenger' as const;
  return null;
}

function seatColors(preference: Room['colorPreference']) {
  if (preference === 'WHITE') return { host: 'white', challenger: 'black' } as const;
  if (preference === 'BLACK') return { host: 'black', challenger: 'white' } as const;
  return { host: null, challenger: null } as const;
}

/** Null when the viewer holds no seat in the room. */
export function toRoomView(
  room: RoomWithSeats,
  viewerId: string,
  isOnline: (userId: string) => boolean,
  now = new Date(),
): RoomView | null {
  const role = roomRole(room, viewerId);
  if (!role) return null;
  const open = isRoomOpen(room, now);
  const colors = seatColors(room.colorPreference);
  return {
    id: room.id,
    revision: room.revision,
    status: roomStatusView(room, now),
    settings: {
      timeControl: timeControlOf(room),
      colorPreference: room.colorPreference.toLowerCase() as ColorPreferenceView,
    },
    seats: {
      host: {
        player: playerProfile(room.host),
        ready: room.hostReady,
        online: isOnline(room.hostId),
        color: colors.host,
      },
      challenger: room.challenger
        ? {
            player: playerProfile(room.challenger),
            ready: room.challengerReady,
            online: isOnline(room.challenger.id),
            color: colors.challenger,
          }
        : null,
    },
    gameId: room.game?.id ?? null,
    expiresAt: room.expiresAt.toISOString(),
    closedAt: room.closedAt?.toISOString() ?? null,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    viewer: {
      role,
      canEditSettings: open && role === 'host',
      canInvite: open && role === 'host' && !room.challengerId,
      canCancel: open && role === 'host',
      canLeave: open && role === 'challenger',
      canSetReady: open && !!room.challengerId,
      canStart: open && role === 'host' && room.status === 'READY',
    },
  };
}

/** Public room facts shown with an invitation, without seat-holder details. */
export function roomSummary(room: RoomWithSeats, now = new Date()) {
  return {
    id: room.id,
    status: roomStatusView(room, now),
    timeControl: timeControlOf(room),
    colorPreference: room.colorPreference.toLowerCase() as ColorPreferenceView,
    host: playerProfile(room.host),
    seatOpen: !room.challengerId,
    expiresAt: room.expiresAt.toISOString(),
  };
}
export type RoomSummary = ReturnType<typeof roomSummary>;
