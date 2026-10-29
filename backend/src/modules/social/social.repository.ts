import { Injectable } from '@nestjs/common';
import {
  afterCursor,
  decodeCursor,
  page,
} from '../../common/pagination/cursor';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { PresenceService } from '../realtime/presence.service';
import { playerProfile } from '../users/users.service';
import { unblockedUserFilter } from './interaction-policy';
import type { SocialPageInput } from './social.schemas';
import { requestInclude, requestView, socialUserSelect } from './social-view';

@Injectable()
export class SocialRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  revision(tx: Prisma.TransactionClient, userId: string) {
    return tx.user
      .findUniqueOrThrow({
        where: { id: userId },
        select: { socialRevision: true },
      })
      .then((u) => u.socialRevision);
  }

  async bumpInTx(tx: Prisma.TransactionClient, userIds: string[]) {
    const revisions: { userId: string; revision: number }[] = [];
    for (const id of [...new Set(userIds)].sort()) {
      const user = await tx.user.update({
        where: { id },
        data: { socialRevision: { increment: 1 } },
        select: { socialRevision: true },
      });
      revisions.push({ userId: id, revision: user.socialRevision });
    }
    return revisions;
  }

  /** One consistent snapshot of revision, eligibility and rows. No per-user presence query. */
  list(
    userId: string,
    kind: 'friends' | 'incoming' | 'outgoing' | 'blocks',
    input: SocialPageInput,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const revision = await this.revision(tx, userId);
        const cursor = afterCursor(decodeCursor(input.cursor));
        const userFilter = {
          usernameKey: { startsWith: input.search.toLowerCase() },
          ...unblockedUserFilter(userId),
        };
        const orderBy = [
          { createdAt: 'desc' as const },
          { id: 'desc' as const },
        ];
        if (kind === 'friends') {
          const rows = await tx.friendship.findMany({
            where: {
              AND: [
                cursor,
                {
                  OR: [
                    { pairLow: userId, high: userFilter },
                    { pairHigh: userId, low: userFilter },
                  ],
                },
              ],
            },
            include: {
              low: { select: socialUserSelect },
              high: { select: socialUserSelect },
            },
            orderBy,
            take: input.limit + 1,
          });
          const result = page(rows, input.limit);
          return {
            revision,
            nextCursor: result.nextCursor,
            items: result.items.map((row) => {
              const friend = row.pairLow === userId ? row.high : row.low;
              return {
                ...playerProfile(friend),
                presence: {
                  status: this.presence.isOnline(friend.id)
                    ? 'ONLINE'
                    : 'OFFLINE',
                },
              };
            }),
          };
        }
        if (kind === 'blocks') {
          const rows = await tx.userBlock.findMany({
            where: {
              blockerId: userId,
              ...cursor,
              blocked: {
                usernameKey: { startsWith: input.search.toLowerCase() },
              },
            },
            include: { blocked: { select: socialUserSelect } },
            orderBy,
            take: input.limit + 1,
          });
          const result = page(rows, input.limit);
          return {
            revision,
            nextCursor: result.nextCursor,
            items: result.items.map((row) => ({
              ...playerProfile(row.blocked),
              createdAt: row.createdAt.toISOString(),
            })),
          };
        }
        const rows = await tx.friendRequest.findMany({
          where: {
            AND: [
              cursor,
              {
                state: 'PENDING',
                ...(kind === 'incoming'
                  ? { recipientId: userId, sender: userFilter }
                  : { senderId: userId, recipient: userFilter }),
              },
            ],
          },
          include: requestInclude,
          orderBy,
          take: input.limit + 1,
        });
        const result = page(rows, input.limit);
        return {
          revision,
          nextCursor: result.nextCursor,
          items: result.items.map(requestView),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
