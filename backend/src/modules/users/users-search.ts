import {
  Controller,
  Get,
  Injectable,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import {
  afterCursor,
  decodeCursor,
  page,
} from '../../common/pagination/cursor';
import { PrismaService } from '../../database/prisma.service';
import { unblockedUserFilter } from '../social/interaction-policy';
import {
  searchUsersSchema,
  type SocialPageInput,
} from '../social/social.schemas';
import { socialUserSelect } from '../social/social-view';
import { playerProfile } from './users.service';

@Injectable()
export class UsersSearchService {
  constructor(private readonly prisma: PrismaService) {}
  search(viewer: string, input: SocialPageInput) {
    return this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: viewer },
          select: { socialRevision: true },
        });
        const rows = await tx.user.findMany({
          where: {
            id: { not: viewer },
            usernameKey: { startsWith: input.search.toLowerCase() },
            ...unblockedUserFilter(viewer),
            ...afterCursor(decodeCursor(input.cursor)),
          },
          select: { ...socialUserSelect, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: input.limit + 1,
        });
        const result = page(rows, input.limit);
        const ids = result.items.map((u) => u.id);
        // Bounded batch relationship queries; no email/password/session fields selected.
        const friends = await tx.friendship.findMany({
          where: {
            OR: [
              { pairLow: viewer, pairHigh: { in: ids } },
              { pairHigh: viewer, pairLow: { in: ids } },
            ],
          },
          select: { pairLow: true, pairHigh: true },
        });
        const requests = await tx.friendRequest.findMany({
          where: {
            state: 'PENDING',
            OR: [
              { senderId: viewer, recipientId: { in: ids } },
              { recipientId: viewer, senderId: { in: ids } },
            ],
          },
          select: { id: true, senderId: true, recipientId: true },
        });
        const friendIds = new Set(
          friends.map((f) => (f.pairLow === viewer ? f.pairHigh : f.pairLow)),
        );
        const byUser = new Map(
          requests.map((r) => [
            r.senderId === viewer ? r.recipientId : r.senderId,
            r,
          ]),
        );
        return {
          revision: user.socialRevision,
          nextCursor: result.nextCursor,
          items: result.items.map((u) => {
            const request = byUser.get(u.id);
            return {
              ...playerProfile(u),
              relationship: friendIds.has(u.id)
                ? { state: 'friends', requestId: null }
                : request
                  ? {
                      state:
                        request.senderId === viewer ? 'outgoing' : 'incoming',
                      requestId: request.id,
                    }
                  : { state: 'none', requestId: null },
            };
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}

@Controller('users')
@UseGuards(AccessTokenGuard)
export class UsersSearchController {
  constructor(private readonly users: UsersSearchService) {}
  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  search(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(searchUsersSchema)) input: SocialPageInput,
  ) {
    return this.users.search(req.user.id, input);
  }
}
