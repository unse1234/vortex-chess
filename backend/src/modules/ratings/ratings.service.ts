import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import {
  calculateElo,
  ELO_V1,
  poolForPreset,
  type Score,
} from './rating-policy';
import { RatingsRepository } from './ratings.repository';
import { findPreset } from '../rooms/time-controls';
import type { GameRatingView } from './rating-view';
import { isRatingEligible } from './rating-eligibility';

/** Ratings never decides a chess result. Games passes its transaction after claiming the result. */
@Injectable()
export class RatingsService {
  constructor(private readonly repository: RatingsRepository) {}

  async snapshotInTx(
    tx: Prisma.TransactionClient,
    userIds: string[],
    initialMs: number,
    incrementMs: number,
  ) {
    const preset = findPreset(initialMs, incrementMs);
    const pool = preset && poolForPreset(preset.id);
    if (!pool || userIds.length !== 2 || userIds[0] === userIds[1])
      throw new Error('Invalid rated game');
    const profiles = await this.repository.lockInTx(tx, userIds, pool);
    // Creation must see the fully settled previous game, never an old queue snapshot.
    const unsettled = await tx.game.findFirst({
      where: {
        rated: true,
        status: 'FINISHED',
        result: { not: 'ABORTED' },
        ratingSettlement: null,
        participants: { some: { userId: { in: userIds } } },
      },
      select: { id: true },
    });
    if (unsettled) throw new Error('Previous rated game is not settled');
    return { pool, policyVersion: ELO_V1.version, profiles };
  }

  async settleInTx(
    tx: Prisma.TransactionClient,
    gameId: string,
  ): Promise<GameRatingView | null> {
    // A revision-guarded game UPDATE already holds this row; explicit lock also makes repeated internal calls safe.
    await tx.$queryRaw`SELECT id FROM "Game" WHERE id = ${gameId}::uuid FOR UPDATE`;
    const game = await tx.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { participants: true },
    });
    if (!isRatingEligible(game)) return null;
    const white = game.participants.find((p) => p.color === 'WHITE');
    const black = game.participants.find((p) => p.color === 'BLACK');
    if (
      !white?.userId ||
      !black?.userId ||
      white.kind !== 'PLAYER' ||
      black.kind !== 'PLAYER' ||
      game.participants.length !== 2 ||
      white.userId === black.userId ||
      !game.ratingPool ||
      game.ratingPolicyVersion !== ELO_V1.version ||
      white.ratingBefore === null ||
      black.ratingBefore === null ||
      white.ratingGamesBefore === null ||
      black.ratingGamesBefore === null
    )
      throw new Error('Invalid rated settlement');
    const existing = await tx.ratingSettlement.findUnique({
      where: { gameId },
      include: { changes: true },
    });
    const profiles = await this.repository.lockInTx(
      tx,
      [white.userId, black.userId],
      game.ratingPool,
    );
    if (!existing) {
      // One active game per account ensures these are still the start snapshots.
      for (const seat of [white, black]) {
        const profile = profiles.find((p) => p.userId === seat.userId)!;
        if (
          profile.rating !== seat.ratingBefore ||
          profile.games !== seat.ratingGamesBefore
        )
          throw new Error('Rating snapshot changed before settlement');
      }
      const score: Score =
        game.result === 'DRAW' ? 0.5 : game.result === 'WHITE_WINS' ? 1 : 0;
      const calculation = calculateElo(
        white.ratingBefore,
        black.ratingBefore,
        score,
      );
      await tx.ratingSettlement.create({
        data: {
          gameId,
          policyVersion: ELO_V1.version,
          kFactor: ELO_V1.kFactor,
          ratingFloor: ELO_V1.ratingFloor,
          expectedWhite: calculation.expectedA,
          scoreWhite: score,
          roundedDeltaWhite: calculation.roundedDeltaA,
          appliedDeltaWhite: calculation.deltaA,
        },
      });
      for (const [seat, opponent, delta, after, resultScore] of [
        [white, black, calculation.deltaA, calculation.afterA, score],
        [black, white, calculation.deltaB, calculation.afterB, 1 - score],
      ] as const) {
        const profile = profiles.find((p) => p.userId === seat.userId)!;
        await tx.playerRating.update({
          where: {
            userId_pool: { userId: seat.userId!, pool: game.ratingPool },
          },
          data: {
            rating: after,
            peakRating: Math.max(profile.peakRating, after),
            games: { increment: 1 },
            revision: { increment: 1 },
            wins: { increment: resultScore === 1 ? 1 : 0 },
            draws: { increment: resultScore === 0.5 ? 1 : 0 },
            losses: { increment: resultScore === 0 ? 1 : 0 },
          },
        });
        await tx.ratingChange.create({
          data: {
            gameId,
            userId: seat.userId!,
            opponentId: opponent.userId!,
            pool: game.ratingPool,
            before: seat.ratingBefore!,
            delta,
            after,
            score: resultScore,
          },
        });
      }
    }
    const changes =
      existing?.changes ??
      (await tx.ratingChange.findMany({ where: { gameId } }));
    const change = (id: string) => {
      const c = changes.find((c) => c.userId === id);
      if (!c) throw new Error('Incomplete rating settlement');
      return {
        before: c.before,
        delta: c.delta,
        after: c.after,
        score: c.score,
      };
    };
    return {
      rated: true,
      pool: game.ratingPool,
      policyVersion: game.ratingPolicyVersion,
      snapshots: {
        w: {
          rating: white.ratingBefore,
          games: white.ratingGamesBefore,
          provisional: white.ratingGamesBefore < ELO_V1.provisionalGames,
        },
        b: {
          rating: black.ratingBefore,
          games: black.ratingGamesBefore,
          provisional: black.ratingGamesBefore < ELO_V1.provisionalGames,
        },
      },
      changes: { w: change(white.userId), b: change(black.userId) },
    };
  }
}
