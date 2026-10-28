import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../../common/errors/api-exception';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import type { MatchmakingSearch, Prisma } from '../../generated/prisma/client';
import { GamesService } from '../games/games.service';
import {
  assertGameEligible,
  lockGameAdmission,
} from '../games/services/game-admission';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
} from '../rooms/time-controls';
import type { JoinMatchmakingInput } from './matchmaking.schemas';

const SEARCH_TTL_MS = 5 * 60_000;
const ARRIVAL_TTL_MS = 30_000;
const pending = ['searching', 'confirming'];
const idle = { state: 'idle', pairId: null, ready: false, gameId: null };

export function matchmakingView(row: MatchmakingSearch | null) {
  return {
    revision: row?.revision ?? 0,
    state: row?.state ?? 'idle',
    searchId: row?.searchId ?? null,
    timeControl: row
      ? { initialMs: row.initialMs, incrementMs: row.incrementMs }
      : null,
    queuedAt: row?.queuedAt.toISOString() ?? null,
    expiresAt: row?.expiresAt.toISOString() ?? null,
    ready: row?.ready ?? false,
    gameId: row?.gameId ?? null,
    reason: row?.reason ?? null,
    serverTime: Date.now(),
  };
}

/** PostgreSQL owns searches, reservations and assignments. A short shared
 * admission transaction serializes queue races and all game creation paths.
 * No socket presence or process-local lock participates in correctness. */
@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly relayedRevisions = new Map<string, number>();
  private maintenanceRunning = false;
  private readonly logger = new Logger(MatchmakingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly games: GamesService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.maintain(), 5000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async maintain() {
    if (this.maintenanceRunning) return;
    this.maintenanceRunning = true;
    try {
      await this.sweep();
      // Socket.IO rooms are local to this worker. Relay committed revisions for
      // its connected accounts, including changes committed by another worker.
      // This map only suppresses redundant delivery; PostgreSQL owns all state.
      const users = this.publisher.connectedUserIds();
      const connected = new Set(users);
      for (const id of this.relayedRevisions.keys())
        if (!connected.has(id)) this.relayedRevisions.delete(id);
      if (!users.length) return;
      const rows = await this.prisma.matchmakingSearch.findMany({
        where: { userId: { in: users } },
      });
      for (const row of rows) {
        if ((this.relayedRevisions.get(row.userId) ?? 0) >= row.revision)
          continue;
        this.publish(row);
        this.relayedRevisions.set(row.userId, row.revision);
      }
    } catch (error) {
      this.logger.warn(
        `Matchmaking maintenance failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    } finally {
      this.maintenanceRunning = false;
    }
  }

  private publish(row: MatchmakingSearch) {
    this.publisher.toUser(
      row.userId,
      row.state === 'matched' ? 'matchmaking.found' : 'matchmaking.status',
      { matchmaking: matchmakingView(row) },
    );
  }

  options() {
    return {
      enabled: this.config.get('MATCHMAKING_ENABLED', { infer: true }),
      timeControls: TIME_CONTROL_PRESETS,
      defaultTimeControlId: DEFAULT_TIME_CONTROL_ID,
      searchTtlMs: SEARCH_TTL_MS,
      arrivalTtlMs: ARRIVAL_TTL_MS,
    };
  }
  private requireEnabled() {
    if (!this.options().enabled)
      throw new ApiException(
        503,
        'matchmaking_disabled',
        'Online matchmaking is not enabled on this server.',
      );
  }

  /** The snapshot query is also the recovery path when an event was missed. */
  status(userId: string) {
    return this.run(userId, async () => {});
  }
  sweep() {
    return this.run(null, async () => {});
  }

  join(userId: string, input: JoinMatchmakingInput) {
    this.requireEnabled();
    return this.run(userId, async (tx, changed) => {
      const current = await tx.matchmakingSearch.findUnique({
        where: { userId },
      });
      if (current?.state === 'matched') return;
      await assertGameEligible(tx, [userId], true);
      if (current && pending.includes(current.state)) {
        if (
          current.initialMs !== input.timeControl.initialMs ||
          current.incrementMs !== input.timeControl.incrementMs
        )
          throw new ApiException(
            409,
            'search_already_active',
            'Cancel your current search before choosing another time control.',
          );
        return;
      }
      const now = new Date();
      const data = {
        ...input.timeControl,
        state: 'searching',
        searchId: randomUUID(),
        queuedAt: now,
        expiresAt: new Date(now.getTime() + SEARCH_TTL_MS),
        pairId: null,
        gameId: null,
        ready: false,
        reason: null,
      };
      await tx.matchmakingSearch.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data, revision: { increment: 1 } },
      });
      changed.add(userId);
      // Oldest compatible waiting account. The account primary key prevents self/duplicate seats.
      const opponent = await tx.matchmakingSearch.findFirst({
        where: {
          state: 'searching',
          userId: { not: userId },
          ...input.timeControl,
          expiresAt: { gt: now },
          user: { gameSeats: { none: { game: { status: 'ACTIVE' } } } },
        },
        orderBy: [{ queuedAt: 'asc' }, { userId: 'asc' }],
      });
      if (!opponent) return;
      await tx.matchmakingSearch.updateMany({
        where: { userId: { in: [userId, opponent.userId] } },
        data: {
          state: 'confirming',
          pairId: randomUUID(),
          ready: false,
          expiresAt: new Date(now.getTime() + ARRIVAL_TTL_MS),
          revision: { increment: 1 },
        },
      });
      changed.add(opponent.userId);
    });
  }

  cancel(userId: string, searchId: string) {
    return this.run(userId, async (tx, changed) => {
      const row = await tx.matchmakingSearch.findUnique({ where: { userId } });
      // An old tab/late request cannot cancel a newer search or a committed game.
      if (!row || row.searchId !== searchId || !pending.includes(row.state))
        return;
      if (row.pairId) {
        const peers = await tx.matchmakingSearch.findMany({
          where: { pairId: row.pairId },
        });
        for (const peer of peers) {
          await tx.matchmakingSearch.update({
            where: { userId: peer.userId },
            data: {
              ...idle,
              reason:
                peer.userId === userId ? 'cancelled' : 'opponent_cancelled',
              revision: { increment: 1 },
            },
          });
          changed.add(peer.userId);
        }
      } else {
        await tx.matchmakingSearch.update({
          where: { userId },
          data: { ...idle, reason: 'cancelled', revision: { increment: 1 } },
        });
        changed.add(userId);
      }
    });
  }

  ready(userId: string, searchId: string) {
    this.requireEnabled();
    return this.run(userId, async (tx, changed) => {
      const row = await tx.matchmakingSearch.findUnique({ where: { userId } });
      if (!row || row.searchId !== searchId || row.state !== 'confirming')
        return;
      if (!row.ready) {
        await tx.matchmakingSearch.update({
          where: { userId },
          data: { ready: true, revision: { increment: 1 } },
        });
        changed.add(userId);
      }
      const seats = await tx.matchmakingSearch.findMany({
        where: { pairId: row.pairId, state: 'confirming' },
      });
      if (seats.length !== 2 || !seats.every((seat) => seat.ready)) return;
      // Both durable claims and the single game commit together; cancel uses this same lock.
      const gameId = await this.games.createRandomInTx(
        tx,
        seats[0].userId,
        seats[1].userId,
        row.initialMs,
        row.incrementMs,
      );
      await tx.matchmakingSearch.updateMany({
        where: { pairId: row.pairId },
        data: {
          state: 'matched',
          pairId: null,
          gameId,
          reason: null,
          revision: { increment: 1 },
        },
      });
      for (const seat of seats) changed.add(seat.userId);
    });
  }

  private async run(
    userId: string | null,
    apply: (
      tx: Prisma.TransactionClient,
      changed: Set<string>,
    ) => Promise<void>,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        await lockGameAdmission(tx);
        const changed = new Set<string>();
        const expired = await tx.matchmakingSearch.findMany({
          where: { state: { in: pending }, expiresAt: { lte: new Date() } },
        });
        for (const row of expired) {
          await tx.matchmakingSearch.update({
            where: { userId: row.userId },
            data: {
              ...idle,
              reason:
                row.state === 'confirming'
                  ? 'arrival_expired'
                  : 'search_expired',
              revision: { increment: 1 },
            },
          });
          changed.add(row.userId);
        }
        // Assignments remain recoverable until the game finishes; then a new search is possible.
        const finished = await tx.matchmakingSearch.findMany({
          where: {
            state: 'matched',
            OR: [{ game: { status: 'FINISHED' } }, { gameId: null }],
          },
        });
        for (const row of finished) {
          await tx.matchmakingSearch.update({
            where: { userId: row.userId },
            data: {
              ...idle,
              reason: 'game_finished',
              revision: { increment: 1 },
            },
          });
          changed.add(row.userId);
        }
        await apply(tx, changed);
        const updates = changed.size
          ? await tx.matchmakingSearch.findMany({
              where: { userId: { in: [...changed] } },
            })
          : [];
        const row = userId
          ? await tx.matchmakingSearch.findUnique({ where: { userId } })
          : null;
        return { updates, row };
      },
      { maxWait: 10000, timeout: 10000 },
    );
    // Personal events go only to authenticated sockets for the account, in every tab.
    for (const row of result.updates) this.publish(row);
    const gameIds = new Set(
      result.updates.flatMap((row) =>
        row.state === 'matched' && row.gameId ? [row.gameId] : [],
      ),
    );
    for (const id of gameIds) await this.games.activate(id);
    return matchmakingView(result.row);
  }
}
