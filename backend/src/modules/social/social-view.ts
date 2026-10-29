import type { FriendRequest, Prisma } from '../../generated/prisma/client';
import { playerProfile } from '../users/users.service';
import { canonicalPair } from './interaction-policy';

export const socialUserSelect = { id: true, username: true } as const;
export function requestView(
  row: FriendRequest & {
    sender: { id: string; username: string };
    recipient: { id: string; username: string };
  },
) {
  return {
    id: row.id,
    sender: playerProfile(row.sender),
    recipient: playerProfile(row.recipient),
    state: row.state,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export const requestInclude = {
  sender: { select: socialUserSelect },
  recipient: { select: socialUserSelect },
} as const;

export async function relationshipInTx(
  tx: Prisma.TransactionClient,
  viewerId: string,
  userId: string,
) {
  const pair = canonicalPair(viewerId, userId);
  const friendship = await tx.friendship.findUnique({
    where: { pairLow_pairHigh: pair },
    select: { id: true },
  });
  if (friendship) return { state: 'friends' as const, requestId: null };
  const pending = await tx.friendRequest.findFirst({
    where: { ...pair, state: 'PENDING' },
    select: { id: true, senderId: true },
  });
  return pending
    ? {
        state:
          pending.senderId === viewerId
            ? ('outgoing' as const)
            : ('incoming' as const),
        requestId: pending.id,
      }
    : { state: 'none' as const, requestId: null };
}
