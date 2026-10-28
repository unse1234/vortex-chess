import {
  HttpException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Subscription } from 'rxjs';
import { randomInt } from 'node:crypto';
import { ApiException } from '../../common/errors/api-exception';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { isEngineError } from '../engines/engine-errors';
import { EnginesService } from '../engines/engines.service';
import type { CreateRoomInput } from '../rooms/rooms.schemas';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeChannels } from '../realtime/realtime-channels.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { gameChannel } from '../realtime/realtime.contracts';
import { ServerClock } from './clocks/server-clock';
import { toSnapshotView } from './game-view';
import { EngineTurnService } from './services/engine-turns.service';
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
    private readonly prisma: PrismaService,
    private readonly engines: EnginesService,
    private readonly engineTurns: EngineTurnService,
    private readonly config: ConfigService<Environment, true>,
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
    // Engine turns are scheduled from the resumed (bumped) revisions.
    await this.engineTurns.recover();
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

  createRandomInTx(tx: Prisma.TransactionClient, firstId: string, secondId: string, initialMs: number, incrementMs: number) {
    const firstWhite = randomInt(2) === 0;
    return this.repository.createInTx(tx, {
      mode: 'RANDOM', whiteId: firstWhite ? firstId : secondId,
      blackId: firstWhite ? secondId : firstId, initialMs, incrementMs,
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

  /**
   * A game against the engine service: one player seat, one engine seat, the
   * room presets for time control and colour. The engine's readiness and the
   * server's admission limit are checked before the clock starts; health is
   * not a reservation, so a later search can still find the service busy.
   * If the engine plays White its opening search starts after the commit.
   */
  async createEngineGame(userId: string, input: CreateRoomInput) {
    let engine: string;
    try {
      ({ engine } = await this.engines.requireReady());
    } catch (error) {
      const kind = isEngineError(error) ? error.kind : 'unavailable';
      if (kind === 'not_configured')
        throw new ApiException(503, 'engine_not_configured', 'Engine play is not available on this server.');
      this.logger.warn(`Engine readiness check failed: ${error instanceof Error ? error.message : 'unknown'}`);
      throw new HttpException(
        { code: 'engine_unavailable', message: 'The engine is not available right now. Try again shortly.', retryable: true },
        503,
      );
    }
    const playerColor =
      input.colorPreference === 'white' ? 'w' : input.colorPreference === 'black' ? 'b' : randomInt(2) === 0 ? 'w' : 'b';
    const maxActive = this.config.get('ENGINE_MAX_ACTIVE_GAMES', { infer: true });
    const created = await this.prisma.$transaction(async (tx) => {
      const admission = await this.repository.admitEngineGameInTx(tx, userId, maxActive);
      if (!admission.admitted) return admission;
      const id = await this.repository.createEngineGameInTx(tx, {
        playerId: userId,
        playerColor,
        engineName: engine,
        initialMs: input.timeControl.initialMs,
        incrementMs: input.timeControl.incrementMs,
        startedAt: this.clock.now(),
      });
      return { admitted: true as const, id };
    });
    if (!created.admitted) {
      if (created.reason === 'own_active')
        throw new HttpException(
          {
            code: 'engine_game_active',
            message: 'You already have an engine game in progress.',
            retryable: false,
            gameId: created.gameId,
          },
          409,
        );
      throw new HttpException(
        { code: 'engine_capacity_reached', message: 'All engine seats are in use. Try again in a few minutes.', retryable: true },
        503,
      );
    }
    await this.activate(created.id);
    await this.engineTurns.recover([created.id]);
    return this.snapshot(userId, created.id);
  }

  /** Engine availability for the setup screen; it reserves nothing. */
  async engineStatus() {
    const availability = await this.engines.availability();
    return {
      available: availability.configured && availability.ready,
      configured: availability.configured,
      engine: availability.engine,
    };
  }

  async snapshot(userId: string, gameId: string) {
    const runtime = await this.commands.runtime(gameId);
    const view =
      runtime &&
      toSnapshotView(
        runtime,
        userId,
        this.clock.now(),
        (id) => this.presence.isOnline(id),
        this.engineTurns.view(gameId),
      );
    if (!view) throw notFound();
    return view;
  }

  /** Only the two players may subscribe; joining sends the authoritative snapshot. */
  private async channelSync(userId: string, gameId: string) {
    const runtime = await this.commands.runtime(gameId);
    const view =
      runtime &&
      toSnapshotView(
        runtime,
        userId,
        this.clock.now(),
        (id) => this.presence.isOnline(id),
        this.engineTurns.view(gameId),
      );
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
