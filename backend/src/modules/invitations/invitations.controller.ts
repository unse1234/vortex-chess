import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { uuidSchema } from '../rooms/rooms.schemas';
import { InvitationsService } from './invitations.service';
import {
  createInvitationSchema,
  listInvitationsSchema,
  type CreateInvitationInput,
  type ListInvitationsInput,
} from './invitations.schemas';

const id = () => new SchemaValidationPipe(uuidSchema);

@Controller()
@UseGuards(AccessTokenGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Account lookup is throttled; not-found responses reveal whether an account exists. */
  @Post('rooms/:roomId/invitations')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', id()) roomId: string,
    @Body(new SchemaValidationPipe(createInvitationSchema))
    body: CreateInvitationInput,
  ) {
    return {
      invitation: await this.invitations.create(request.user.id, roomId, body),
    };
  }

  @Get('rooms/:roomId/invitations')
  forRoom(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', id()) roomId: string,
  ) {
    return this.invitations.listForRoom(request.user.id, roomId);
  }

  @Get('invitations')
  list(
    @Req() request: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(listInvitationsSchema))
    query: ListInvitationsInput,
  ) {
    return this.invitations.list(request.user.id, query);
  }

  @Get('invitations/:invitationId')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', id()) invitationId: string,
  ) {
    return {
      invitation: await this.invitations.get(request.user.id, invitationId),
    };
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(200)
  async accept(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', id()) invitationId: string,
  ) {
    return {
      invitation: await this.invitations.accept(request.user.id, invitationId),
    };
  }

  @Post('invitations/:invitationId/decline')
  @HttpCode(200)
  async decline(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', id()) invitationId: string,
  ) {
    return {
      invitation: await this.invitations.decline(request.user.id, invitationId),
    };
  }

  @Post('invitations/:invitationId/cancel')
  @HttpCode(200)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', id()) invitationId: string,
  ) {
    return {
      invitation: await this.invitations.cancel(request.user.id, invitationId),
    };
  }
}
