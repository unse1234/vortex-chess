import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Subscription } from 'rxjs';
import { ApiException } from '../../common/errors/api-exception';
import { DeferredFailure, unwrap } from '../../common/errors/deferred-failure';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { GamesService } from '../games/games.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PresenceService } from '../realtime/presence.service';
import { retryTransaction } from '../../database/retry-transaction';
import { lockGameAdmission } from '../games/services/game-admission';
import { assertInteractionAllowed, lockInteractionPair } from '../social/interaction-policy';
import { RealtimeChannels } from '../realtime/realtime-channels.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { roomChannel } from '../realtime/realtime.contracts';
import { loadRoom, lockRoom, publishRoom, updateRoom } from './room-events';
import {
  isRoomOpen,
  roomInclude,
  roomRole,
  toRoomView,
  type RoomWithSeats,
} from './room-view';
import {
  toColorEnum,
  type CreateRoomInput,
  type ReadinessInput,
  type StartRoomInput,
  type UpdateRoomSettingsInput,
} from './rooms.schemas';
import {
  DEFAULT_TIME_CONTROL_ID,
  TIME_CONTROL_PRESETS,
} from './time-controls';

const error = (status: number, code: string, message: string) =>
  new ApiException(status, code, message);
const notFound = () =>
  error(404, 'room_not_found', 'This room does not exist or you are not in it.');
const notHost = () =>
  error(403, 'not_room_host', 'Only the host can change this room.');
const revisionConflict = () =>
  error(
    409,
    'room_revision_conflict',
    'The room changed. Review the latest settings and try again.',
  );
const closed = (room: RoomWithSeats) =>
  room.status === 'STARTED'
    ? error(409, 'room_started', 'The game for this room has already started.')
    : room.status === 'CANCELLED'
      ? error(409, 'room_cancelled', 'The host cancelled this room.')
      : error(409, 'room_expired', 'This room has expired.');

type Role = 'host' | 'challenger';
type Mutation = { room: RoomWithSeats; changed: boolean; invitationIds?: string[] };

@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomsService.name);
  private sweep?: NodeJS.Timeout;
  private presenceChanges?: Subscription;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly presence: PresenceService,
    private readonly channels: RealtimeChannels,
    private readonly publisher: RealtimePublisher,
    private readonly invitations: InvitationsService,
    private readonly games: GamesService,
  ) {}

  onModuleInit() {
    this.channels.register('room', (userId, roomId) =>
      this.channelSync(userId, roomId),
    );
    this.presenceChanges = this.presence.changes$.subscribe(
      ({ userId, online }) => void this.publishPresence(userId, online),
    );
    const seconds = this.config.get('EXPIRY_SWEEP_INTERVAL_SECONDS', {
      infer: true,
    });
    if (seconds > 0) {
      this.sweep = setInterval(() => {
        this.expireDue().catch((e: unknown) =>
          this.logger.warn(
            `Room expiry sweep failed: ${e instanceof Error ? e.name : 'UnknownError'}`,
          ),
        );
      }, seconds * 1000);
      this.sweep.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.sweep);
    this.presenceChanges?.unsubscribe();
  }

  options() {
    return {
      timeControls: TIME_CONTROL_PRESETS,
      defaultTimeControlId: DEFAULT_TIME_CONTROL_ID,
      colorPreferences: ['random', 'white', 'black'] as const,
      roomTtlMinutes: this.config.get('ROOM_TTL_MINUTES', { infer: true }),
      invitationTtlMinutes: this.config.get('INVITATION_TTL_MINUTES', {
        infer: true,
      }),
    };
  }

  async create(userId: string, input: CreateRoomInput) {
    const max = this.config.get('MAX_ACTIVE_ROOMS_PER_USER', { infer: true });
    const ttl = this.config.get('ROOM_TTL_MINUTES', { infer: true }) * 60_000;
    const room = unwrap(
      await this.prisma.$transaction(async (tx) => {
        // Serializes one host's concurrent creations so the limit is exact.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
        const active = await tx.room.count({
          where: {
            hostId: userId,
            status: { in: ['WAITING', 'READY'] },
            expiresAt: { gt: new Date() },
          },
        });
        if (active >= max)
          return new DeferredFailure(
            error(
              409,
              'too_many_active_rooms',
              `You can host at most ${max} open rooms. Cancel one to create another.`,
            ),
          );
        const created = await tx.room.create({ data: {
            hostId: userId,
            initialMs: input.timeControl.initialMs,
            incrementMs: input.timeControl.incrementMs,
            colorPreference: toColorEnum(input.colorPreference),
            expiresAt: new Date(Date.now() + ttl),
          } });
        return (await loadRoom(tx, created.id))!;
      }),
    );
    return this.view(room, userId);
  }

  async get(userId: string, roomId: string) {
    await this.expireDue(roomId);
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: roomInclude,
    });
    if (!room || !roomRole(room, userId)) throw notFound();
    return this.view(room, userId);
  }

  /** Material changes reset both players' readiness and bump the revision. */
  updateSettings(userId: string, roomId: string, input: UpdateRoomSettingsInput) {
    return this.mutate(userId, roomId, async (tx, room, role) => {
      if (role !== 'host') return new DeferredFailure(notHost());
      if (room.revision !== input.expectedRevision)
        return new DeferredFailure(revisionConflict());
      const next = {
        initialMs: input.timeControl?.initialMs ?? room.initialMs,
        incrementMs: input.timeControl?.incrementMs ?? room.incrementMs,
        colorPreference: input.colorPreference
          ? toColorEnum(input.colorPreference)
          : room.colorPreference,
      };
      if (
        next.initialMs === room.initialMs &&
        next.incrementMs === room.incrementMs &&
        next.colorPreference === room.colorPreference
      )
        return { room, changed: false };
      return {
        changed: true,
        room: await updateRoom(tx, room.id, {
            ...next,
            hostReady: false,
            challengerReady: false,
            status: 'WAITING',
            revision: { increment: 1 },
          }),
      };
    });
  }

  /** Readiness confirms the revision the player saw; stale confirmations conflict. */
  setReady(userId: string, roomId: string, input: ReadinessInput) {
    return this.mutate(userId, roomId, async (tx, room, role) => {
      if (room.revision !== input.expectedRevision)
        return new DeferredFailure(revisionConflict());
      if (!room.challengerId)
        return new DeferredFailure(
          error(409, 'room_not_full', 'Readiness opens once a challenger joins.'),
        );
      const current = role === 'host' ? room.hostReady : room.challengerReady;
      if (current === input.ready) return { room, changed: false };
      const hostReady = role === 'host' ? input.ready : room.hostReady;
      const challengerReady =
        role === 'challenger' ? input.ready : room.challengerReady;
      return {
        changed: true,
        room: await updateRoom(tx, room.id, {
            hostReady,
            challengerReady,
            status: hostReady && challengerReady ? 'READY' : 'WAITING',
            revision: { increment: 1 },
          }),
      };
    });
  }

  /**
   * Creates the room's one game. Under the room lock it checks the host, the
   * revision the host confirmed, both seats and both readiness flags, then in
   * the same transaction creates the game, closes pending invitations and
   * marks the room started. Repeating a start returns the started room;
   * Game.roomId is unique as a second guard.
   */
  async start(userId: string, roomId: string, input: StartRoomInput) {
    let gameId: string | undefined;
    const view = await this.mutate(
      userId,
      roomId,
      async (tx, room, role) => {
        if (role !== 'host')
          return new DeferredFailure(
            error(403, 'not_room_host', 'Only the host can start the game.'),
          );
        if (room.status === 'STARTED') return { room, changed: false };
        if (!isRoomOpen(room)) return new DeferredFailure(closed(room));
        if (room.revision !== input.expectedRevision)
          return new DeferredFailure(revisionConflict());
        if (!room.challengerId || room.status !== 'READY')
          return new DeferredFailure(
            error(409, 'room_not_ready', 'Both players must be ready to start.'),
          );
        gameId = await this.games.createForRoomInTx(tx, {
          id: room.id,
          hostId: room.hostId,
          challengerId: room.challengerId,
          initialMs: room.initialMs,
          incrementMs: room.incrementMs,
          colorPreference: room.colorPreference,
        });
        const invitationIds = await this.invitations.closePendingForRoomInTx(tx, room.id);
        const updated = await updateRoom(tx, room.id, {
          status: 'STARTED',
          revision: { increment: 1 },
        });
        return { room: updated, changed: true, invitationIds };
      },
      { allowClosed: true, gameAdmission: true },
    );
    if (gameId) await this.games.activate(gameId);
    return view;
  }

  /** Idempotent; also cancels the room's pending invitations atomically. */
  cancel(userId: string, roomId: string) {
    return this.mutate(
      userId,
      roomId,
      async (tx, room, role) => {
        if (role !== 'host') return new DeferredFailure(notHost());
        if (room.status === 'CANCELLED') return { room, changed: false };
        if (!isRoomOpen(room)) return new DeferredFailure(closed(room));
        const updated = await updateRoom(tx, room.id, {
            status: 'CANCELLED',
            closedAt: new Date(),
            hostReady: false,
            challengerReady: false,
            revision: { increment: 1 },
          });
        const invitationIds = await this.invitations.closePendingForRoomInTx(
          tx,
          room.id,
        );
        return { room: updated, changed: true, invitationIds };
      },
      { allowClosed: true },
    );
  }

  /** The challenger gives up the seat; the host can invite someone else. */
  async leave(userId: string, roomId: string) {
    await this.mutate(userId, roomId, async (tx, room, role) => {
      if (role !== 'challenger')
        return new DeferredFailure(
          error(403, 'not_room_challenger', 'Only the challenger can leave; hosts cancel the room.'),
        );
      return {
        changed: true,
        room: await updateRoom(tx, room.id, {
            challengerId: null,
            hostReady: false,
            challengerReady: false,
            status: 'WAITING',
            revision: { increment: 1 },
          }),
      };
    });
  }

  /**
   * Persists expiry for due open rooms (and their invitations), then publishes.
   * Every room operation calls it, so expiry holds even without the sweep.
   */
  async expireDue(roomId?: string) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Room"
      SET "status" = 'EXPIRED', "closedAt" = now(), "hostReady" = false,
          "challengerReady" = false, "revision" = "revision" + 1, "updatedAt" = now()
      WHERE "status" IN ('WAITING', 'READY') AND "expiresAt" <= now()
        ${roomId ? Prisma.sql`AND "id" = ${roomId}::uuid` : Prisma.empty}
      RETURNING "id"`;
    for (const { id } of rows) {
      await this.invitations.expireDue({ roomId: id });
      const room = await this.prisma.room.findUnique({
        where: { id },
        include: roomInclude,
      });
      if (room) await publishRoom(this.publisher, this.presence, room);
    }
    return rows.length;
  }

  private async mutate(
    userId: string,
    roomId: string,
    apply: (
      tx: Prisma.TransactionClient,
      room: RoomWithSeats,
      role: Role,
    ) => Promise<Mutation | DeferredFailure>,
    options: { allowClosed?: boolean; gameAdmission?: boolean } = {},
  ) {
    await this.expireDue(roomId);
    const result = await retryTransaction(() => this.prisma.$transaction(async (tx) => {
      let pairedChallenger: string | null = null;
      if (options.gameAdmission) {
        await lockGameAdmission(tx);
        const ref = await tx.room.findUnique({ where: { id: roomId }, select: { hostId: true, challengerId: true } });
        pairedChallenger = ref?.challengerId ?? null;
        if (ref?.challengerId) await lockInteractionPair(tx, ref.hostId, ref.challengerId);
      }
      const room = await lockRoom(tx, roomId);
      const role = room && roomRole(room, userId);
      if (!room || !role) return new DeferredFailure(notFound());
      if (options.gameAdmission && room.status !== 'STARTED') {
        if (room.challengerId !== pairedChallenger) return new DeferredFailure(revisionConflict());
        if (room.challengerId) await assertInteractionAllowed(tx, room.hostId, room.challengerId);
      }
      if (!options.allowClosed && !isRoomOpen(room))
        return new DeferredFailure(closed(room));
      return apply(tx, room, role);
    }));
    const mutation = unwrap(result);
    if (mutation.changed) {
      await publishRoom(this.publisher, this.presence, mutation.room);
      await this.invitations.publishInvitations(mutation.invitationIds ?? []);
    }
    return this.view(mutation.room, userId);
  }

  private view(room: RoomWithSeats, userId: string) {
    return toRoomView(room, userId, (id) => this.presence.isOnline(id));
  }

  /** Subscription authorization plus the sync snapshot sent after joining. */
  private async channelSync(userId: string, roomId: string) {
    await this.expireDue(roomId);
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: roomInclude,
    });
    const view = room && this.view(room, userId);
    if (!view) return null;
    return [
      { channel: roomChannel(roomId), type: 'room.updated', payload: { room: view } },
    ];
  }

  /** Presence is not persisted room state, so it does not change the revision. */
  private async publishPresence(userId: string, online: boolean) {
    try {
      const rooms = await this.prisma.room.findMany({
        where: {
          OR: [{ hostId: userId }, { challengerId: userId }],
          status: { in: ['WAITING', 'READY'] },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      for (const { id } of rooms)
        await this.publisher.toChannelViewers(
          roomChannel(id),
          'room.presence',
          () => ({ roomId: id, userId, online }),
        );
    } catch (e) {
      this.logger.warn(
        `Presence publish failed: ${e instanceof Error ? e.name : 'UnknownError'}`,
      );
    }
  }
}
