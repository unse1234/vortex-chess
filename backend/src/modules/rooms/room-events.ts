import type { Prisma } from '../../generated/prisma/client';
import type { PresenceService } from '../realtime/presence.service';
import type { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { roomChannel } from '../realtime/realtime.contracts';
import { toRoomView, type RoomWithSeats } from './room-view';

const profileSelect = { id: true, username: true } as const;

/**
 * Loads a room with its seat holders using sequential statements. Inside an
 * interactive transaction a relation `include` would issue overlapping
 * queries on the transaction's single connection.
 */
export async function loadRoom(
  tx: Prisma.TransactionClient,
  roomId: string,
): Promise<RoomWithSeats | null> {
  const room = await tx.room.findUnique({ where: { id: roomId } });
  if (!room) return null;
  const users = await tx.user.findMany({
    where: { id: { in: room.challengerId ? [room.hostId, room.challengerId] : [room.hostId] } },
    select: profileSelect,
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const game = await tx.game.findUnique({ where: { roomId }, select: { id: true } });
  return {
    ...room,
    game,
    host: byId.get(room.hostId)!,
    challenger: room.challengerId ? (byId.get(room.challengerId) ?? null) : null,
  };
}

/** Row lock that serializes every seat, settings and lifecycle change of one room. */
export async function lockRoom(tx: Prisma.TransactionClient, roomId: string) {
  await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId}::uuid FOR UPDATE`;
  return loadRoom(tx, roomId);
}

export async function updateRoom(
  tx: Prisma.TransactionClient,
  roomId: string,
  data: Prisma.RoomUncheckedUpdateInput,
) {
  await tx.room.update({ where: { id: roomId }, data });
  return (await loadRoom(tx, roomId))!;
}

/** Sends each subscribed participant their own view; call only after commit. */
export function publishRoom(
  publisher: RealtimePublisher,
  presence: PresenceService,
  room: RoomWithSeats,
) {
  return publisher.toChannelViewers(
    roomChannel(room.id),
    'room.updated',
    (viewerId) => {
      const view = toRoomView(room, viewerId, (id) => presence.isOnline(id));
      return view ? { room: view } : null;
    },
  );
}
