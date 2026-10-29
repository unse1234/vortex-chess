import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../../common/errors/api-exception';
import { DeferredFailure } from '../../common/errors/deferred-failure';
import {
  afterCursor,
  decodeCursor,
  page,
} from '../../common/pagination/cursor';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { retryTransaction } from '../../database/retry-transaction';
import { assertInteractionAllowed, interactionAllowed, lockInteractionPair } from '../social/interaction-policy';
import { Prisma } from '../../generated/prisma/client';
import type { InvitationStatus } from '../../generated/prisma/client';
import { EmailOutboxService, type ClaimedEmailJob } from '../mail/email-outbox.service';
import { EmailWorkerService } from '../mail/email-worker.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import { loadRoom, lockRoom, publishRoom, updateRoom } from '../rooms/room-events';
import { isRoomOpen, roomRole } from '../rooms/room-view';
import type { RoomWithSeats } from '../rooms/room-view';
import { timeControlOf } from '../rooms/time-controls';
import { renderInvitationEmail } from './invitation-email.template';
import {
  effectiveInvitationStatus,
  invitationInclude,
  toInvitationView,
  type InvitationWithRelations,
} from './invitation-view';
import type {
  CreateInvitationInput,
  ListInvitationsInput,
} from './invitations.schemas';

export const INVITATION_EMAIL_KIND = 'invitation';

const error = (status: number, code: string, message: string) =>
  new ApiException(status, code, message);
const invitationNotFound = () =>
  error(404, 'invitation_not_found', 'This invitation does not exist.');
const wrongAccount = () =>
  error(
    403,
    'invitation_wrong_account',
    'This invitation was sent to a different account. Sign in as the invited player to respond.',
  );
const roomNotFound = () =>
  error(404, 'room_not_found', 'This room does not exist or you are not in it.');
const closedStatus: Record<
  Exclude<InvitationStatus, 'PENDING'>,
  [string, string]
> = {
  ACCEPTED: ['invitation_accepted', 'This invitation has already been accepted.'],
  DECLINED: ['invitation_declined', 'This invitation was declined.'],
  CANCELLED: ['invitation_cancelled', 'The host cancelled this invitation.'],
  EXPIRED: ['invitation_expired', 'This invitation has expired.'],
};
const closedError = (status: Exclude<InvitationStatus, 'PENDING'>) =>
  error(409, ...closedStatus[status]);
const roomClosedError = (room: RoomWithSeats) =>
  room.status === 'STARTED'
    ? error(409, 'room_full', 'The challenger seat is already taken.')
    : room.status === 'CANCELLED'
      ? error(409, 'room_cancelled', 'The host cancelled this room.')
      : error(409, 'room_expired', 'This room has expired.');

type Change = {
  invitationIds: string[];
  notificationIds: string[];
  room?: RoomWithSeats;
  emailQueued?: boolean;
};

@Injectable()
export class InvitationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvitationsService.name);
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly presence: PresenceService,
    private readonly publisher: RealtimePublisher,
    private readonly notifications: NotificationsService,
    private readonly outbox: EmailOutboxService,
    private readonly worker: EmailWorkerService,
  ) {}

  onModuleInit() {
    this.outbox.registerHandler(INVITATION_EMAIL_KIND, (job) =>
      this.decideInvitationEmail(job),
    );
    const seconds = this.config.get('EXPIRY_SWEEP_INTERVAL_SECONDS', {
      infer: true,
    });
    if (seconds > 0) {
      this.sweep = setInterval(() => {
        this.expireDue().catch((e: unknown) =>
          this.logger.warn(
            `Invitation expiry sweep failed: ${e instanceof Error ? e.name : 'UnknownError'}`,
          ),
        );
      }, seconds * 1000);
      this.sweep.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.sweep);
  }

  async create(senderId: string, roomId: string, input: CreateInvitationInput) {
    // Authorize the room first, so only hosts can look up accounts.
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true, challengerId: true },
    });
    const role = room && roomRole(room, senderId);
    if (!role) throw roomNotFound();
    if (role !== 'host')
      throw error(403, 'not_room_host', 'Only the host can invite players.');

    const target = input.recipient;
    const recipient = await this.prisma.user.findUnique({
      where:
        target.kind === 'EMAIL'
          ? { email: target.email }
          : { usernameKey: target.usernameKey },
      select: { id: true },
    });
    if (!recipient)
      throw new ApiException(
        404,
        'account_not_found',
        'No Vortex Chess account uses that username or email. Invitations can only be sent to registered players.',
        { recipient: ['No registered player matches this username or email.'] },
      );
    if (recipient.id === senderId)
      throw new ApiException(
        400,
        'self_invitation',
        "You can't invite yourself.",
        { recipient: ["You can't invite yourself."] },
      );

    let result: Change & { invitation: InvitationWithRelations } | DeferredFailure;
    try {
      result = await retryTransaction(() => this.prisma.$transaction(async (tx) => {
        await lockInteractionPair(tx, senderId, recipient.id);
        await assertInteractionAllowed(tx, senderId, recipient.id);
        // The room lock serializes every invitation write for this room.
        const locked = await lockRoom(tx, roomId);
        if (!locked) return new DeferredFailure(roomNotFound());
        if (!isRoomOpen(locked)) return new DeferredFailure(roomClosedError(locked));
        if (locked.challengerId)
          return new DeferredFailure(
            error(409, 'room_full', 'The challenger seat is already taken.'),
          );
        const expired = await tx.invitation.updateManyAndReturn({
          where: {
            roomId,
            recipientId: recipient.id,
            status: 'PENDING',
            expiresAt: { lte: new Date() },
          },
          data: { status: 'EXPIRED' },
          select: { id: true },
        });
        const pending = await tx.invitation.findFirst({
          where: { roomId, recipientId: recipient.id, status: 'PENDING' },
          select: { id: true },
        });
        if (pending)
          return new DeferredFailure(
            new ApiException(
              409,
              'invitation_pending',
              'This player already has a pending invitation to this room.',
              { recipient: ['Already invited to this room.'] },
            ),
            expired.map((row) => row.id),
          );
        const ttl =
          this.config.get('INVITATION_TTL_MINUTES', { infer: true }) * 60_000;
        const expiresAt = new Date(
          Math.min(Date.now() + ttl, locked.expiresAt.getTime()),
        );
        const created = await tx.invitation.create({ data: {
            roomId,
            senderId,
            recipientId: recipient.id,
            addressedBy: target.kind,
            expiresAt,
          } });
        const invitation = (await this.loadInvitation(tx, created.id))!;
        const notificationId = await this.notifications.createInTx(tx, {
          recipientId: recipient.id,
          actorId: senderId,
          type: 'INVITATION_RECEIVED',
          invitationId: invitation.id,
          roomId,
          dedupeKey: `invitation.received:${invitation.id}`,
        });
        // Delivery policy: an offline recipient (no authenticated socket) gets
        // an email job in this same transaction; it is rechecked before sending.
        const emailQueued =
          !this.presence.isOnline(recipient.id) &&
          !!(await this.outbox.enqueueInTx(tx, {
            kind: INVITATION_EMAIL_KIND,
            dedupeKey: `invitation-email:${invitation.id}`,
            recipientId: recipient.id,
            invitationId: invitation.id,
          }));
        return {
          invitation,
          invitationIds: [invitation.id, ...expired.map((row) => row.id)],
          notificationIds: notificationId ? [notificationId] : [],
          emailQueued,
        };
      }));
    } catch (e) {
      // Safety net: the partial unique index rejects a concurrent duplicate.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new ApiException(
          409,
          'invitation_pending',
          'This player already has a pending invitation to this room.',
          { recipient: ['Already invited to this room.'] },
        );
      throw e;
    }
    const change = await this.settle(result);
    return toInvitationView(change.invitation, senderId)!;
  }

  async get(userId: string, invitationId: string) {
    await this.expireDue({ invitationId });
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: invitationInclude,
    });
    if (!invitation) throw invitationNotFound();
    const view = toInvitationView(invitation, userId);
    if (!view) throw wrongAccount();
    return view;
  }

  async list(userId: string, input: ListInvitationsInput) {
    await this.expireDue({ userId });
    const rows = await this.prisma.invitation.findMany({
      where: {
        ...(input.role === 'received'
          ? { recipientId: userId }
          : { senderId: userId }),
        ...(input.status === 'pending' ? { status: 'PENDING' } : {}),
        ...afterCursor(decodeCursor(input.cursor)),
      },
      include: invitationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const now = new Date();
    const result = page(rows, input.limit);
    return {
      items: result.items.map((row) => toInvitationView(row, userId, now)!),
      nextCursor: result.nextCursor,
    };
  }

  /** Invitations sent for one room; host only. */
  async listForRoom(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true, challengerId: true },
    });
    const role = room && roomRole(room, userId);
    if (!role) throw roomNotFound();
    if (role !== 'host')
      throw error(403, 'not_room_host', 'Only the host can see invitations.');
    await this.expireDue({ roomId });
    const rows = await this.prisma.invitation.findMany({
      where: { roomId },
      include: invitationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
    });
    const now = new Date();
    return { items: rows.map((row) => toInvitationView(row, userId, now)!) };
  }

  /**
   * Atomically validates recipient, status, expiry, room availability and the
   * challenger seat under the room lock. Repeats return the existing outcome.
   */
  async accept(userId: string, invitationId: string) {
    const ref = await this.reference(userId, invitationId, 'recipient');
    const result = await retryTransaction(() => this.prisma.$transaction(async (tx) => {
      await lockInteractionPair(tx, ref.senderId, ref.recipientId);
      await assertInteractionAllowed(tx, ref.senderId, ref.recipientId);
      // Lock order: pair, room, invitation.
      const room = await lockRoom(tx, ref.roomId);
      const invitation = await this.lockInvitation(tx, invitationId);
      if (!room || !invitation) return new DeferredFailure(invitationNotFound());
      if (invitation.status === 'ACCEPTED')
        return { invitation, invitationIds: [], notificationIds: [] };
      const closed = await this.closedOutcome(tx, invitation);
      if (closed) return closed;
      if (!isRoomOpen(room)) return new DeferredFailure(roomClosedError(room));
      if (room.challengerId && room.challengerId !== userId)
        return new DeferredFailure(
          error(409, 'room_full', 'Another player has already taken the challenger seat.'),
        );
      const updatedRoom = await updateRoom(tx, room.id, {
          challengerId: userId,
          hostReady: false,
          challengerReady: false,
          status: 'WAITING',
          revision: { increment: 1 },
        });
      const accepted = await this.updateInvitation(tx, invitationId, { status: 'ACCEPTED', respondedAt: new Date() });
      const notificationId = await this.notifications.createInTx(tx, {
        recipientId: accepted.senderId,
        actorId: userId,
        type: 'INVITATION_ACCEPTED',
        invitationId,
        roomId: room.id,
        dedupeKey: `invitation.accepted:${invitationId}`,
      });
      return {
        invitation: accepted,
        room: updatedRoom,
        invitationIds: [invitationId],
        notificationIds: notificationId ? [notificationId] : [],
      };
    }));
    const change = await this.settle(result);
    return toInvitationView(change.invitation, userId)!;
  }

  async decline(userId: string, invitationId: string) {
    await this.reference(userId, invitationId, 'recipient');
    const result = await this.prisma.$transaction(async (tx) => {
      const invitation = await this.lockInvitation(tx, invitationId);
      if (!invitation) return new DeferredFailure(invitationNotFound());
      if (invitation.status === 'DECLINED')
        return { invitation, invitationIds: [], notificationIds: [] };
      const closed = await this.closedOutcome(tx, invitation);
      if (closed) return closed;
      const declined = await this.updateInvitation(tx, invitationId, { status: 'DECLINED', respondedAt: new Date() });
      const notificationId = await this.notifications.createInTx(tx, {
        recipientId: declined.senderId,
        actorId: userId,
        type: 'INVITATION_DECLINED',
        invitationId,
        roomId: declined.roomId,
        dedupeKey: `invitation.declined:${invitationId}`,
      });
      return {
        invitation: declined,
        invitationIds: [invitationId],
        notificationIds: notificationId ? [notificationId] : [],
      };
    });
    const change = await this.settle(result);
    return toInvitationView(change.invitation, userId)!;
  }

  async cancel(userId: string, invitationId: string) {
    const ref = await this.reference(userId, invitationId, 'sender');
    const result = await this.prisma.$transaction(async (tx) => {
      await lockRoom(tx, ref.roomId);
      const invitation = await this.lockInvitation(tx, invitationId);
      if (!invitation) return new DeferredFailure(invitationNotFound());
      if (invitation.status === 'CANCELLED')
        return { invitation, invitationIds: [], notificationIds: [] };
      const closed = await this.closedOutcome(tx, invitation);
      if (closed) return closed;
      const cancelled = await this.updateInvitation(tx, invitationId, { status: 'CANCELLED' });
      return {
        invitation: cancelled,
        invitationIds: [invitationId],
        notificationIds: [],
      };
    });
    const change = await this.settle(result);
    return toInvitationView(change.invitation, userId)!;
  }

  /** Used by room cancellation, inside its transaction and room lock. */
  async closePendingForRoomInTx(tx: Prisma.TransactionClient, roomId: string) {
    const rows = await tx.invitation.updateManyAndReturn({
      where: { roomId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Social owns the pair lock; Invitations owns invalidation of its records. */
  async cancelPairInTx(tx: Prisma.TransactionClient, a: string, b: string) {
    const rows = await tx.invitation.updateManyAndReturn({
      where: { status: 'PENDING', OR: [{ senderId: a, recipientId: b }, { senderId: b, recipientId: a }] },
      data: { status: 'CANCELLED' }, select: { id: true },
    });
    return rows.map(row => row.id);
  }

  /**
   * Persists expiry for due pending invitations and notifies both parties.
   * Runs on every relevant read and from the periodic sweep.
   */
  async expireDue(
    filter: { invitationId?: string; roomId?: string; userId?: string } = {},
  ) {
    const rows = await this.prisma.invitation.updateManyAndReturn({
      where: {
        status: 'PENDING',
        expiresAt: { lte: new Date() },
        ...(filter.invitationId ? { id: filter.invitationId } : {}),
        ...(filter.roomId ? { roomId: filter.roomId } : {}),
        ...(filter.userId
          ? { OR: [{ senderId: filter.userId }, { recipientId: filter.userId }] }
          : {}),
      },
      data: { status: 'EXPIRED' },
      select: { id: true },
    });
    await this.publishInvitations(rows.map((row) => row.id));
    return rows.length;
  }

  async publishInvitations(ids: string[]) {
    if (ids.length === 0) return;
    const rows = await this.prisma.invitation.findMany({
      where: { id: { in: ids } },
      include: invitationInclude,
    });
    const now = new Date();
    for (const row of rows)
      for (const userId of [row.senderId, row.recipientId])
        this.publisher.toUser(userId, 'invitation.updated', {
          invitation: toInvitationView(row, userId, now),
        });
  }

  private async publish(change: Change) {
    if (change.room)
      await publishRoom(this.publisher, this.presence, change.room);
    await this.publishInvitations(change.invitationIds);
    await this.notifications.publishCreated(change.notificationIds);
    if (change.emailQueued) this.worker.nudge();
  }

  /** Authorizes before any lock; the id alone grants nothing. */
  private async reference(
    userId: string,
    invitationId: string,
    required: 'sender' | 'recipient',
  ) {
    await this.expireDue({ invitationId });
    const ref = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      select: { roomId: true, senderId: true, recipientId: true },
    });
    if (!ref) throw invitationNotFound();
    const role =
      ref.senderId === userId
        ? 'sender'
        : ref.recipientId === userId
          ? 'recipient'
          : null;
    if (!role) throw wrongAccount();
    if (role !== required)
      throw required === 'recipient'
        ? error(403, 'not_invitation_recipient', 'Only the invited player can respond.')
        : error(403, 'not_invitation_sender', 'Only the host who sent it can cancel this invitation.');
    return ref;
  }

  private async lockInvitation(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${id}::uuid FOR UPDATE`;
    return this.loadInvitation(tx, id);
  }

  /** Sequential loads inside transactions (see loadRoom). */
  private async loadInvitation(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<InvitationWithRelations | null> {
    const invitation = await tx.invitation.findUnique({ where: { id } });
    if (!invitation) return null;
    const room = (await loadRoom(tx, invitation.roomId))!;
    const users = await tx.user.findMany({
      where: { id: { in: [invitation.senderId, invitation.recipientId] } },
      select: { id: true, username: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return {
      ...invitation,
      room,
      sender: byId.get(invitation.senderId)!,
      recipient: byId.get(invitation.recipientId)!,
    };
  }

  private async updateInvitation(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.InvitationUncheckedUpdateInput,
  ) {
    await tx.invitation.update({ where: { id }, data });
    return (await this.loadInvitation(tx, id))!;
  }

  /** Clear conflict for answered/closed invitations; records a due expiry. */
  private async closedOutcome(
    tx: Prisma.TransactionClient,
    invitation: InvitationWithRelations,
  ) {
    if (invitation.status !== 'PENDING')
      return new DeferredFailure(closedError(invitation.status));
    if (effectiveInvitationStatus(invitation) === 'expired') {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      // The expiry commits and is published before the request fails.
      return new DeferredFailure(closedError('EXPIRED'), [invitation.id]);
    }
    return null;
  }

  /** Publishes committed changes, then returns the result or throws its failure. */
  private async settle<T extends Change>(
    result: T | DeferredFailure,
  ): Promise<T> {
    if (result instanceof DeferredFailure) {
      await this.publishInvitations(result.changedIds);
      throw result.error;
    }
    await this.publish(result);
    return result;
  }

  /** Recheck immediately before sending, per the delivery policy. */
  private async decideInvitationEmail(job: ClaimedEmailJob) {
    if (!job.invitationId)
      return { action: 'skip', reason: 'invitation_missing' } as const;
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: job.invitationId },
      include: {
        ...invitationInclude,
        recipient: { select: { id: true, username: true, email: true } },
      },
    });
    if (!invitation)
      return { action: 'skip', reason: 'invitation_missing' } as const;
    if (!(await interactionAllowed(this.prisma, invitation.senderId, invitation.recipientId)))
      return { action: 'skip', reason: 'interaction_unavailable' } as const;
    const status = effectiveInvitationStatus(invitation);
    if (status !== 'pending')
      return { action: 'skip', reason: `invitation_${status}` } as const;
    if (!isRoomOpen(invitation.room))
      return { action: 'skip', reason: 'room_closed' } as const;
    if (invitation.room.challengerId)
      return { action: 'skip', reason: 'room_full' } as const;
    if (this.presence.isOnline(invitation.recipientId))
      return { action: 'skip', reason: 'recipient_online' } as const;
    if (
      await this.notifications.invitationNotificationRead(
        invitation.id,
        invitation.recipientId,
      )
    )
      return { action: 'skip', reason: 'notification_read' } as const;
    const base =
      this.config.get('APP_PUBLIC_URL', { infer: true }) ??
      this.config.get('CORS_ORIGINS', { infer: true })[0];
    return {
      action: 'send',
      message: renderInvitationEmail({
        to: invitation.recipient.email,
        senderUsername: invitation.sender.username,
        timeControl: timeControlOf(invitation.room),
        colorPreference: invitation.room.colorPreference.toLowerCase() as
          | 'white'
          | 'black'
          | 'random',
        expiresAt: invitation.expiresAt,
        link: new URL(
          `/rooms/join/${invitation.id}`,
          base.endsWith('/') ? base : `${base}/`,
        ).toString(),
      }),
    } as const;
  }
}
