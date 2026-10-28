import { ApiException } from '../../../common/errors/api-exception';
import type { Prisma } from '../../../generated/prisma/client';

/** Shared by ALL game creation and queue mutations. Database-scoped, across workers.
 * Acquire before reading eligibility, never hold while doing network calls. */
export async function lockGameAdmission(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vortix:game-admission'))`;
}

export async function assertGameEligible(
  tx: Prisma.TransactionClient,
  userIds: string[],
  allowQueue = false,
) {
  const active = await tx.game.findFirst({
    where: {
      status: 'ACTIVE',
      participants: { some: { userId: { in: userIds } } },
    },
    select: { id: true },
  });
  if (active)
    throw new ApiException(
      409,
      'active_game_conflict',
      'A player already has a game in progress. Finish it first.',
    );
  if (!allowQueue) {
    const queued = await tx.matchmakingSearch.findFirst({
      where: {
        userId: { in: userIds },
        state: { in: ['searching', 'confirming'] },
        expiresAt: { gt: new Date() },
      },
    });
    if (queued)
      throw new ApiException(
        409,
        'matchmaking_active',
        'Cancel the active matchmaking search before starting another game.',
      );
  }
}
