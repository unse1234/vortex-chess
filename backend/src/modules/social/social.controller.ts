import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { uuidSchema } from '../rooms/rooms.schemas';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';
import {
  requestListSchema,
  sendRequestSchema,
  socialPageSchema,
  socialUserIdSchema,
  type SocialPageInput,
} from './social.schemas';
import { z } from 'zod';

const requestActionSchema = z.enum(['accept', 'decline', 'cancel']);

@Controller('social')
@UseGuards(AccessTokenGuard)
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly repository: SocialRepository,
  ) {}
  @Get('friends')
  friends(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(socialPageSchema)) input: SocialPageInput,
  ) {
    return this.repository.list(req.user.id, 'friends', input);
  }
  @Get('requests')
  requests(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(requestListSchema))
    input: SocialPageInput & { direction: 'incoming' | 'outgoing' },
  ) {
    return this.repository.list(req.user.id, input.direction, input);
  }
  @Post('requests')
  @HttpCode(200)
  send(
    @Req() req: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(sendRequestSchema))
    input: { userId: string },
  ) {
    return this.social.send(req.user.id, input.userId);
  }
  @Post('requests/:id/:action')
  @HttpCode(200)
  respond(
    @Req() req: AuthenticatedRequest,
    @Param('id', new SchemaValidationPipe(uuidSchema)) id: string,
    @Param('action', new SchemaValidationPipe(requestActionSchema))
    action: 'accept' | 'decline' | 'cancel',
  ) {
    return this.social.respond(req.user.id, id, action);
  }
  @Delete('friends/:id')
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', new SchemaValidationPipe(socialUserIdSchema)) id: string,
  ) {
    return this.social.remove(req.user.id, id);
  }
  @Get('blocks')
  blocks(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(socialPageSchema)) input: SocialPageInput,
  ) {
    return this.repository.list(req.user.id, 'blocks', input);
  }
  @Post('blocks')
  @HttpCode(200)
  block(
    @Req() req: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(sendRequestSchema))
    input: { userId: string },
  ) {
    return this.social.block(req.user.id, input.userId);
  }
  @Delete('blocks/:id')
  unblock(
    @Req() req: AuthenticatedRequest,
    @Param('id', new SchemaValidationPipe(socialUserIdSchema)) id: string,
  ) {
    return this.social.unblock(req.user.id, id);
  }
}
