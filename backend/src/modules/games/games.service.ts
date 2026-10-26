import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { randomInt } from 'node:crypto';
import { ApiException } from '../../common/errors/api-exception';
import type { Prisma } from '../../generated/prisma/client';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeChannels } from '../realtime/realtime-channels.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { gameChannel } from '../realtime/realtime.contracts';
import { ServerClock } from './clocks/server-clock';
import { toSnapshotView } from './game-view';
import { GameCommandsService } from './services/game-commands.service';
import { GameRepository } from './services/game-repository';
import { GameStore } from './services/game-store';

export type StartableRoom = {
  id: string;
  hostId: string;
  challengerId: string;
  initialMs: number;
  incrementMs: number;
  colorPreference: 'WHITE' | 'BLACK' | 'RANDOM';
};

const notFound = () =>
  new ApiException(404, 'game_not_found', "This game doesn't exist, or you aren't playing in it.");

/**
 * Game lifecycle around the command pipeline: creation from a room,
 * authorized snapshots and channel subscriptions, presence, and resuming
 * active games when the server starts.
 */
@Injectable()
export class GamesService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GamesService.name);
  private presenceChanges?: Subscription;

  constructor(
    private readonly repository: GameRepository,
    private readonly commands: GameCommandsService,
    private readonly store: GameStore,
    private readonly clock: ServerClock,
    private readonly channels: RealtimeChannels,
    private readonly presence: PresenceService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.channels.register('game', (userId, gameId) => this.channelSync(userId, gameId));
    this.presenceChanges = this.presence.changes$.subscribe(({ userId, online }) =>
      void this.publishPresence(userId, online),
    );
  }

  onModuleDestroy() {
    this.presenceChanges?.unsubscribe();
  }

  /**
   * Restart policy: the side to move in each active game resumes with the
   * time it had when its turn began; clocks restart now. Players are never
   * charged for server downtime.
   */
  async onApplicationBootstrap() {
    const ids = await this.repository.resumeActive(this.clock.now());
    for (const id of ids) {
      try {
        await this.commands.runtime(id);
      } catch (error) {
        this.logger.error(
          `Could not resume game ${id}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
    if (ids.length) this.logger.log(`Resumed ${ids.length} active game(s)`);
  }

  /**
   * Creates the room's game inside the room-start transaction: colours from
   * the host's preference, immutable time control, the standard start
   * position and White's clock running from now.
   */
  createForRoomInTx(tx: Prisma.TransactionClient, room: StartableRoom) {
    const hostWhite =
      room.colorPreference === 'WHITE' ||
      (room.colorPreference === 'RANDOM' && randomInt(2) === 0);
    return this.repository.createInTx(tx, {
      roomId: room.id,
      whiteId: hostWhite ? room.hostId : room.challengerId,
      blackId: hostWhite ? room.challengerId : room.hostId,
      initialMs: room.initialMs,
      incrementMs: room.incrementMs,
      startedAt: this.clock.now(),
    });
  }

  /** After the start transaction commits: warm the game and arm its clock. */
  async activate(gameId: string) {
    try {
      await this.commands.runtime(gameId);
    } catch (error) {
      // The game is committed; the next access loads it.
      this.logger.warn(
        `Game ${gameId} not warmed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }
  }

  async snapshot(userId: string, gameId: string) {
    const runtime = await this.commands.runtime(gameId);
    const view =
      runtime &&
      toSnapshotView(runtime, userId, this.clock.now(), (id) => this.presence.isOnline(id));
    if (!view) throw notFound();
    return view;
  }

  /** Only the two players may subscribe; joining sends the authoritative snapshot. */
  private async channelSync(userId: string, gameId: string) {
    const runtime = await this.commands.runtime(gameId);
    const view =
      runtime &&
      toSnapshotView(runtime, userId, this.clock.now(), (id) => this.presence.isOnline(id));
    if (!view) return null;
    return [{ channel: gameChannel(gameId), type: 'game.snapshot', payload: { game: view } }];
  }

  /** Presence is not game state: it never changes the revision. */
  private async publishPresence(userId: string, online: boolean) {
    for (const runtime of this.store.forUser(userId)) {
      if (runtime.state.status !== 'active') continue;
      const gameId = runtime.state.id;
      await this.publisher.toChannelViewers(gameChannel(gameId), 'game.presence', () => ({
        id: gameId,
        userId,
        online,
      }));
    }
  }
}
