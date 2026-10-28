import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { decodeCursor, encodeCursor } from '../../../common/pagination/cursor';
import type { GameHistoryInput } from '../games.schemas';
import { timeControlOf } from '../../rooms/time-controls';
import { gameIdSchema } from '../games.schemas';
import { ApiException } from '../../../common/errors/api-exception';
import { ENGINE_PLAYER_ID } from './game-state';

@Injectable()
export class GameHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, input: GameHistoryInput) {
    const cursor = decodeCursor(input.cursor);
    if (cursor && !gameIdSchema.safeParse(cursor.id).success)
      throw new ApiException(
        400,
        'invalid_cursor',
        'The page cursor is invalid.',
      );
    const colors = input.side ? [input.side] : ['w', 'b'];
    const rows = await this.prisma.game.findMany({
      where: {
        status: 'FINISHED',
        AND: [
          {
            OR: colors.map((color) => {
              const win =
                color === 'w'
                  ? ('WHITE_WINS' as const)
                  : ('BLACK_WINS' as const);
              const loss =
                color === 'w'
                  ? ('BLACK_WINS' as const)
                  : ('WHITE_WINS' as const);
              return {
                participants: {
                  some: {
                    userId,
                    color:
                      color === 'w' ? ('WHITE' as const) : ('BLACK' as const),
                  },
                },
                ...(input.result
                  ? {
                      result:
                        input.result === 'draw'
                          ? ('DRAW' as const)
                          : input.result === 'win'
                            ? win
                            : loss,
                    }
                  : {}),
              };
            }),
          },
          ...(cursor
            ? [
                {
                  OR: [
                    { endedAt: { lt: cursor.createdAt } },
                    { endedAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      select: {
        id: true,
        endedAt: true,
        startedAt: true,
        result: true,
        mode: true,
        rated: true,
        ratingPool: true,
        ratingPolicyVersion: true,
        ratingSettlement: { select: { changes: { where: { userId },
          select: { before: true, delta: true, after: true, score: true } } } },
        initialMs: true,
        incrementMs: true,
        participants: {
          select: {
            color: true,
            engineName: true,
            user: { select: { id: true, username: true } },
          },
        },
      },
    });
    const items = rows.slice(0, input.limit).map((game) => {
      const viewer = game.participants.find((p) => p.user?.id === userId)!;
      const opponent = game.participants.find((p) => p !== viewer)!;
      const side = viewer.color === 'WHITE' ? 'w' : 'b';
      const won = (game.result === 'WHITE_WINS') === (side === 'w');
      return {
        id: game.id,
        endedAt: game.endedAt!.toISOString(),
        startedAt: game.startedAt.toISOString(),
        side,
        mode: game.mode === 'ENGINE' ? ('engine' as const) : game.mode === 'RANDOM' ? ('random' as const) : ('friends' as const),
        timeControl: timeControlOf(game),
        rated: game.rated,
        ratingPool: game.ratingPool,
        ratingPolicyVersion: game.ratingPolicyVersion,
        ratingChange: game.ratingSettlement?.changes[0] ?? null,
        result:
          game.result === 'ABORTED'
            ? ('aborted' as const)
            : game.result === 'DRAW'
              ? ('draw' as const)
              : won
                ? ('win' as const)
                : ('loss' as const),
        viewer: { ...viewer.user!, avatarUrl: null },
        opponent: opponent.user
          ? { ...opponent.user, avatarUrl: null, kind: 'human' as const }
          : { id: ENGINE_PLAYER_ID, username: opponent.engineName ?? 'Engine', avatarUrl: null, kind: 'engine' as const },
      };
    });
    const last = rows[input.limit - 1];
    return {
      items,
      nextCursor:
        rows.length > input.limit && last
          ? encodeCursor({ createdAt: last.endedAt!, id: last.id })
          : null,
    };
  }
}
