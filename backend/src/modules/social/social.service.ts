import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../../common/errors/api-exception';
import type { Environment } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { retryTransaction } from '../../database/retry-transaction';
import type { Prisma } from '../../generated/prisma/client';
import { lockGameAdmission } from '../games/services/game-admission';
import { InvitationsService } from '../invitations/invitations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  assertInteractionAllowed,
  interactionAllowed,
  interactionUnavailable,
  lockInteractionPair,
} from './interaction-policy';
import { SocialRepository } from './social.repository';
import { relationshipInTx, requestInclude, requestView } from './social-view';

type Effects = {
  changed: boolean;
  notifications: string[];
  invitations: string[];
};
const noEffects = (): Effects => ({
  changed: false,
  notifications: [],
  invitations: [],
});

/** Requests and relationships only. Invitations and inbox entries retain their owners. */
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly repository: SocialRepository,
    private readonly notifications: NotificationsService,
    private readonly invitations: InvitationsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  private async targetInTx(
    tx: Prisma.TransactionClient,
    actor: string,
    target: string,
  ) {
    if (actor === target)
      throw new ApiException(400, 'self_interaction', 'Choose another player.');
    if (
      !(await tx.user.findUnique({
        where: { id: target },
        select: { id: true },
      }))
    )
      throw interactionUnavailable();
  }

  private async run(
    actor: string,
    target: string,
    apply: (
      tx: Prisma.TransactionClient,
      pair: { pairLow: string; pairHigh: string },
    ) => Promise<Effects>,
    options: { admission?: boolean; rate?: boolean } = {},
  ) {
    const result = await retryTransaction(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (options.admission) await lockGameAdmission(tx);
          if (options.rate)
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`vortix:friend-rate:${actor}`}, 0))`;
          const pair = await lockInteractionPair(tx, actor, target);
          await this.targetInTx(tx, actor, target);
          const effects = await apply(tx, pair);
          const revisions = effects.changed
            ? await this.repository.bumpInTx(tx, [actor, target])
            : [];
          const allowed = await interactionAllowed(tx, actor, target);
          const relationship = allowed
            ? await relationshipInTx(tx, actor, target)
            : { state: 'unavailable' as const, requestId: null };
          return {
            effects,
            revisions,
            response: {
              revision: await this.repository.revision(tx, actor),
              relationship,
            },
          };
        },
        { maxWait: 10000, timeout: 10000 },
      ),
    );
    // Events carry invalidations only, so a delayed event cannot restore an old relationship.
    for (const { userId, revision } of result.revisions)
      this.publisher.toUser(userId, 'social.updated', {
        eventId: `social:${userId}:${revision}`,
        revision,
      });
    await this.invitations.publishInvitations(result.effects.invitations);
    await this.notifications.publishCreated(result.effects.notifications);
    return result.response;
  }

  send(actor: string, target: string) {
    return this.run(
      actor,
      target,
      async (tx, pair) => {
        await assertInteractionAllowed(tx, actor, target);
        const current = await relationshipInTx(tx, actor, target);
        if (current.state !== 'none') return noEffects();
        const last = await tx.friendRequest.findFirst({
          where: pair,
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        });
        const cooldown =
          this.config.get('FRIEND_REQUEST_COOLDOWN_SECONDS', { infer: true }) *
          1000;
        if (last && Date.now() - last.updatedAt.getTime() < cooldown)
          throw new ApiException(
            429,
            'friend_request_cooldown',
            'Please wait before sending another request.',
          );
        const count = await tx.friendRequest.count({
          where: {
            senderId: actor,
            createdAt: { gt: new Date(Date.now() - 3600000) },
          },
        });
        if (
          count >=
          this.config.get('FRIEND_REQUEST_MAX_PER_HOUR', { infer: true })
        )
          throw new ApiException(
            429,
            'friend_request_rate_limit',
            'Too many friend requests. Please try again later.',
          );
        const request = await tx.friendRequest.create({
          data: { senderId: actor, recipientId: target, ...pair },
        });
        const id = await this.notifications.createInTx(tx, {
          recipientId: target,
          actorId: actor,
          type: 'FRIEND_REQUEST_RECEIVED',
          friendRequestId: request.id,
          dedupeKey: `friend.request:${request.id}`,
        });
        return {
          changed: true,
          notifications: id ? [id] : [],
          invitations: [],
        };
      },
      { rate: true },
    );
  }

  async respond(
    actor: string,
    requestId: string,
    action: 'accept' | 'decline' | 'cancel',
  ) {
    const ref = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
    });
    if (!ref || (ref.senderId !== actor && ref.recipientId !== actor))
      throw new ApiException(
        404,
        'friend_request_not_found',
        'Friend request not found.',
      );
    if ((action === 'cancel' ? ref.senderId : ref.recipientId) !== actor)
      throw new ApiException(
        403,
        'friend_request_forbidden',
        'You cannot perform this action.',
      );
    const target = ref.senderId === actor ? ref.recipientId : ref.senderId;
    const result = await this.run(actor, target, async (tx, pair) => {
      const row = await tx.friendRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
      // Completed requests are immutable. In particular ACCEPTED never recreates a removed friendship.
      if (row.state !== 'PENDING') return noEffects();
      if (action === 'accept')
        await assertInteractionAllowed(tx, actor, target);
      await tx.friendRequest.update({
        where: { id: requestId },
        data: {
          state:
            action === 'accept'
              ? 'ACCEPTED'
              : action === 'decline'
                ? 'DECLINED'
                : 'CANCELLED',
          respondedAt: new Date(),
        },
      });
      if (action !== 'accept') return { ...noEffects(), changed: true };
      await tx.friendship.upsert({
        where: { pairLow_pairHigh: pair },
        create: pair,
        update: {},
      });
      const id = await this.notifications.createInTx(tx, {
        recipientId: target,
        actorId: actor,
        type: 'FRIEND_REQUEST_ACCEPTED',
        friendRequestId: requestId,
        dedupeKey: `friend.accepted:${requestId}`,
      });
      return { changed: true, notifications: id ? [id] : [], invitations: [] };
    });
    const row = await this.prisma.friendRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: requestInclude,
    });
    return { ...result, request: requestView(row) };
  }

  remove(actor: string, target: string) {
    return this.run(actor, target, async (tx, pair) => {
      const deleted = await tx.friendship.deleteMany({ where: pair });
      return { ...noEffects(), changed: deleted.count > 0 };
    });
  }

  block(actor: string, target: string) {
    return this.run(
      actor,
      target,
      async (tx, pair) => {
        const existing = await tx.userBlock.findUnique({
          where: {
            blockerId_blockedId: { blockerId: actor, blockedId: target },
          },
        });
        if (existing) return noEffects();
        await tx.userBlock.create({
          data: { blockerId: actor, blockedId: target },
        });
        await tx.friendship.deleteMany({ where: pair });
        await tx.friendRequest.updateMany({
          where: { ...pair, state: 'PENDING' },
          data: { state: 'CANCELLED', respondedAt: new Date() },
        });
        const invitations = await this.invitations.cancelPairInTx(
          tx,
          actor,
          target,
        );
        return { changed: true, notifications: [], invitations };
      },
      { admission: true },
    );
  }

  unblock(actor: string, target: string) {
    return this.run(actor, target, async (tx) => {
      const deleted = await tx.userBlock.deleteMany({
        where: { blockerId: actor, blockedId: target },
      });
      return { ...noEffects(), changed: deleted.count > 0 };
    });
  }
}
