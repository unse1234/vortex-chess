import { Injectable } from '@nestjs/common';
import { ApiException } from '../../common/errors/api-exception';
import {
  afterCursor,
  decodeCursor,
  page,
} from '../../common/pagination/cursor';
import { PrismaService } from '../../database/prisma.service';
import type { NotificationType, Prisma } from '../../generated/prisma/client';
import { RealtimePublisher } from '../realtime/realtime-publisher.service';
import {
  notificationInclude,
  toNotificationView,
} from './notification-view';

const notFound = () =>
  new ApiException(404, 'notification_not_found', 'Notification not found.');

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
  ) {}

  /**
   * Records one inbox entry per dedupe key inside the caller's transaction.
   * Returns the new id, or null when the event was already recorded.
   */
  async createInTx(
    tx: Prisma.TransactionClient,
    input: {
      recipientId: string;
      actorId: string;
      type: NotificationType;
      invitationId: string;
      roomId: string;
      dedupeKey: string;
    },
  ) {
    const created = await tx.notification.createManyAndReturn({
      data: [input],
      skipDuplicates: true,
      select: { id: true },
    });
    return created[0]?.id ?? null;
  }

  /** Call after commit. Missed deliveries are recovered by the inbox endpoint. */
  async publishCreated(ids: string[]) {
    if (ids.length === 0) return;
    const rows = await this.prisma.notification.findMany({
      where: { id: { in: ids } },
      include: notificationInclude,
    });
    for (const row of rows)
      this.publisher.toUser(row.recipientId, 'notification.created', {
        notification: toNotificationView(row),
        unreadCount: await this.unreadCount(row.recipientId),
      });
  }

  async list(userId: string, input: { cursor?: string; limit: number }) {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: userId, ...afterCursor(decodeCursor(input.cursor)) },
      include: notificationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
    });
    const now = new Date();
    const result = page(rows, input.limit);
    return {
      items: result.items.map((row) => toNotificationView(row, now)),
      nextCursor: result.nextCursor,
      unreadCount: await this.unreadCount(userId),
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { recipientId: userId, readAt: null },
    });
  }

  /** Owner-only; marking read never answers the invitation it refers to. */
  async markRead(userId: string, id: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({
      where: { id, recipientId: userId },
      include: notificationInclude,
    });
    if (!row) throw notFound();
    const unreadCount = await this.unreadCount(userId);
    if (updated.count > 0)
      this.publisher.toUser(userId, 'notification.read', {
        ids: [id],
        all: false,
        unreadCount,
      });
    return { notification: toNotificationView(row), unreadCount };
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count > 0)
      this.publisher.toUser(userId, 'notification.read', {
        ids: [],
        all: true,
        unreadCount: 0,
      });
    return { unreadCount: await this.unreadCount(userId) };
  }

  /** Whether the recipient has already seen the invitation in the inbox. */
  async invitationNotificationRead(invitationId: string, recipientId: string) {
    return !!(await this.prisma.notification.findFirst({
      where: {
        invitationId,
        recipientId,
        type: 'INVITATION_RECEIVED',
        readAt: { not: null },
      },
      select: { id: true },
    }));
  }
}
