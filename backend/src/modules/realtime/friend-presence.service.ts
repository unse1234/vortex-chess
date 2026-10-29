import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Subscription } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { unblockedUserFilter } from '../social/interaction-policy';
import { PresenceService } from './presence.service';
import { RealtimePublisher } from './realtime-publisher.service';

/** No arbitrary subscriptions, last-seen or activity. A presence change only
 * invalidates accepted friends' snapshots on their existing personal channel.
 * Invalidations contain no subject identity/status; a delayed one grants no access. */
@Injectable()
export class FriendPresenceService implements OnModuleInit, OnModuleDestroy {
  private subscription?: Subscription;
  private readonly logger = new Logger(FriendPresenceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly publisher: RealtimePublisher,
  ) {}
  onModuleInit() {
    this.subscription = this.presence.changes$.subscribe(({ userId }) => {
      void this.publish(userId).catch(() =>
        this.logger.warn('Friend presence refresh failed'),
      );
    });
  }
  onModuleDestroy() {
    this.subscription?.unsubscribe();
  }
  private async publish(userId: string) {
    const filter = unblockedUserFilter(userId);
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { pairLow: userId, high: filter },
          { pairHigh: userId, low: filter },
        ],
      },
      select: { pairLow: true, pairHigh: true },
    });
    for (const row of rows)
      this.publisher.toUser(
        row.pairLow === userId ? row.pairHigh : row.pairLow,
        'social.presence',
        {},
      );
  }
}
