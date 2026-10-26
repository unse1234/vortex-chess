import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { RoomsService } from './rooms.service';
import {
  createRoomSchema,
  readinessSchema,
  startRoomSchema,
  updateRoomSettingsSchema,
  uuidSchema,
  type CreateRoomInput,
  type ReadinessInput,
  type StartRoomInput,
  type UpdateRoomSettingsInput,
} from './rooms.schemas';

const roomId = () => new SchemaValidationPipe(uuidSchema);

@Controller('rooms')
@UseGuards(AccessTokenGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('options')
  options() {
    return this.rooms.options();
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(createRoomSchema)) body: CreateRoomInput,
  ) {
    return { room: await this.rooms.create(request.user.id, body) };
  }

  @Get(':roomId')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
  ) {
    return { room: await this.rooms.get(request.user.id, id) };
  }

  @Patch(':roomId/settings')
  async settings(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
    @Body(new SchemaValidationPipe(updateRoomSettingsSchema))
    body: UpdateRoomSettingsInput,
  ) {
    return { room: await this.rooms.updateSettings(request.user.id, id, body) };
  }

  @Post(':roomId/ready')
  @HttpCode(200)
  async ready(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
    @Body(new SchemaValidationPipe(readinessSchema)) body: ReadinessInput,
  ) {
    return { room: await this.rooms.setReady(request.user.id, id, body) };
  }

  /** Host only; creates the game once both players are ready. */
  @Post(':roomId/start')
  @HttpCode(200)
  async start(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
    @Body(new SchemaValidationPipe(startRoomSchema)) body: StartRoomInput,
  ) {
    return { room: await this.rooms.start(request.user.id, id, body) };
  }

  @Post(':roomId/cancel')
  @HttpCode(200)
  async cancel(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
  ) {
    return { room: await this.rooms.cancel(request.user.id, id) };
  }

  @Post(':roomId/leave')
  @HttpCode(204)
  async leave(
    @Req() request: AuthenticatedRequest,
    @Param('roomId', roomId()) id: string,
  ) {
    await this.rooms.leave(request.user.id, id);
  }
}
