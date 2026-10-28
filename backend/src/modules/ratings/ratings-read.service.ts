import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { Environment } from '../../config/environment';
import { ApiException } from '../../common/errors/api-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import type { PlayerRating } from '../../generated/prisma/client';
import { ELO_V1, RATING_POOLS, type Pool } from './rating-policy';
import type { LeaderboardInput, RatingHistoryInput } from './ratings.schemas';
import { z } from 'zod';

function profileView(profile: PlayerRating | undefined, pool: Pool) {
  const games = profile?.games ?? 0;
  return {
    pool,
    rating: profile?.rating ?? ELO_V1.initialRating,
    peakRating: profile?.peakRating ?? ELO_V1.initialRating,
    games,
    wins: profile?.wins ?? 0,
    draws: profile?.draws ?? 0,
    losses: profile?.losses ?? 0,
    revision: profile?.revision ?? 0,
    provisional: games < ELO_V1.provisionalGames,
    placementsRemaining: Math.max(0, ELO_V1.provisionalGames - games),
  };
}
@Injectable()
export class RatingsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
  ) {}
  private requireEnabled() {
    if (!this.config.get('RATINGS_ENABLED', { infer: true }))
      throw new ApiException(
        503,
        'ratings_disabled',
        'Ratings and leaderboards are currently unavailable.',
      );
  }
  async mine(userId: string) {
    this.requireEnabled();
    const profiles = await this.prisma.playerRating.findMany({
      where: { userId },
    });
    return {
      policyVersion: ELO_V1.version,
      items: RATING_POOLS.map((pool) =>
        profileView(
          profiles.find((p) => p.pool === pool),
          pool,
        ),
      ),
    };
  }
  async history(userId: string, input: RatingHistoryInput) {
    this.requireEnabled();
    const cursor = decodeCursor(input.cursor);
    if (cursor && !z.uuid().safeParse(cursor.id).success)
      throw new ApiException(
        400,
        'invalid_cursor',
        'The page cursor is invalid.',
      );
    const rows = await this.prisma.ratingChange.findMany({
      where: {
        userId,
        pool: input.pool,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, gameId: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { gameId: 'desc' }],
      take: input.limit + 1,
      select: {
        gameId: true,
        pool: true,
        before: true,
        delta: true,
        after: true,
        score: true,
        createdAt: true,
        opponent: { select: { id: true, username: true } },
        settlement: { select: { policyVersion: true } },
      },
    });
    const last = rows[input.limit - 1];
    return {
      items: rows
        .slice(0, input.limit)
        .map(({ createdAt, settlement, ...rest }) => ({
          ...rest,
          createdAt: createdAt.toISOString(),
          policyVersion: settlement.policyVersion,
        })),
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor({ createdAt: last.createdAt, id: last.gameId })
          : null,
    };
  }
  async leaderboard(input: LeaderboardInput) {
    this.requireEnabled();
    const asOf = Date.now();
    return this.prisma.$transaction(
      async (tx) => {
        const total = await tx.playerRating.count({
          where: {
            pool: input.pool,
            games: { gte: ELO_V1.provisionalGames },
            leaderboardEligible: true,
          },
        });
        // Competition rank is computed over the entire eligible pool BEFORE pagination.
        const rows = await tx.$queryRaw<
          {
            userId: string;
            username: string;
            rating: number;
            games: number;
            wins: number;
            draws: number;
            losses: number;
            rank: bigint;
          }[]
        >`
        WITH ranked AS (
          SELECT r."userId", u.username, r.rating, r.games, r.wins, r.draws, r.losses,
            RANK() OVER (ORDER BY r.rating DESC) AS rank
          FROM "PlayerRating" r JOIN "User" u ON u.id = r."userId"
          WHERE r.pool = ${input.pool}::"RatingPool" AND r.games >= ${ELO_V1.provisionalGames} AND r."leaderboardEligible"
        ) SELECT * FROM ranked ORDER BY rating DESC, "userId" ASC
          LIMIT ${input.limit} OFFSET ${(input.page - 1) * input.limit}`;
        return {
          pool: input.pool,
          page: input.page,
          limit: input.limit,
          total,
          asOf,
          items: rows.map(({ rank, userId, username, ...rest }) => ({
            ...rest,
            rank: Number(rank),
            user: { id: userId, username },
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async position(userId: string, pool: Pool) {
    this.requireEnabled();
    const asOf = Date.now();
    return this.prisma.$transaction(
      async (tx) => {
        const profile = await tx.playerRating.findUnique({
          where: { userId_pool: { userId, pool } },
        });
        const view = { ...profileView(profile ?? undefined, pool), asOf };
        if (profile && !profile.leaderboardEligible)
          return { ...view, status: 'ineligible' as const, rank: null };
        if (view.provisional)
          return { ...view, status: 'provisional' as const, rank: null };
        const ahead = await tx.playerRating.count({
          where: {
            pool,
            games: { gte: ELO_V1.provisionalGames },
            leaderboardEligible: true,
            rating: { gt: view.rating },
          },
        });
        return { ...view, status: 'ranked' as const, rank: ahead + 1 };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
