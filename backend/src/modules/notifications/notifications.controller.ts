import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { uuidSchema } from '../rooms/rooms.schemas';
import { NotificationsService } from './notifications.service';

const listSchema = z
  .object({
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

@Controller('notifications')
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(listSchema)) query: z.infer<typeof listSchema>,
  ) {
    return this.notifications.list(request.user.id, query);
  }

  @Get('unread-count')
  async unread(@Req() request: AuthenticatedRequest) {
    return { unreadCount: await this.notifications.unreadCount(request.user.id) };
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.user.id);
  }

  @Post(':notificationId/read')
  @HttpCode(200)
  read(
    @Req() request: AuthenticatedRequest,
    @Param('notificationId', new SchemaValidationPipe(uuidSchema)) id: string,
  ) {
    return this.notifications.markRead(request.user.id, id);
  }
}
