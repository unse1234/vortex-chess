import { Injectable } from '@nestjs/common';
import type { Prisma, RatingPool } from '../../generated/prisma/client';
import { ELO_V1 } from './rating-policy';

/** All writes participate in the caller's transaction; locks are always in user-id order. */
@Injectable()
export class RatingsRepository {
  async ensureInTx(
    tx: Prisma.TransactionClient,
    userIds: string[],
    pool: RatingPool,
  ) {
    const ids = [...new Set(userIds)].sort();
    for (const userId of ids) {
      await tx.playerRating.upsert({
        where: { userId_pool: { userId, pool } },
        create: {
          userId,
          pool,
          rating: ELO_V1.initialRating,
          peakRating: ELO_V1.initialRating,
        },
        update: {},
      });
    }
    return ids;
  }
  async lockInTx(
    tx: Prisma.TransactionClient,
    userIds: string[],
    pool: RatingPool,
  ) {
    const ids = await this.ensureInTx(tx, userIds, pool);
    for (const id of ids) {
      await tx.$queryRaw`SELECT "userId" FROM "PlayerRating"
        WHERE "userId" = ${id}::uuid AND "pool" = ${pool}::"RatingPool" FOR UPDATE`;
    }
    return tx.playerRating.findMany({ where: { userId: { in: ids }, pool } });
  }
}
