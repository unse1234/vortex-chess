import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { ServerClock } from './clocks/server-clock';
import { GamesService } from './games.service';
import {
  drawResponseSchema,
  gameIdSchema,
  moveCommandSchema,
  simpleCommandSchema,
  type DrawResponseInput,
  type MoveCommandInput,
  type SimpleCommandInput,
} from './games.schemas';
import {
  GameCommandsService,
  type CommandContext,
  type CommandResult,
} from './services/game-commands.service';

const gameId = () => new SchemaValidationPipe(gameIdSchema);

/** Rejections keep the API error shape and add the authoritative state when known. */
function respond(result: CommandResult) {
  if (result.ok) return { game: result.game, duplicate: result.duplicate };
  const { status, code, message, retryable } = result.error;
  throw new HttpException({ code, message, retryable, game: result.game }, status);
}

/**
 * Snapshot reads plus an HTTP path for the same commands the realtime gateway
 * accepts. Both call GameCommandsService; there is one rules implementation.
 * Receipt time is taken after authentication, so the realtime path is the
 * primary, more precise one.
 */
@Controller('games')
@UseGuards(AccessTokenGuard)
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly commands: GameCommandsService,
    private readonly clock: ServerClock,
  ) {}

  private context(): CommandContext {
    return { receivedAt: this.clock.now(), receivedPerf: performance.now() };
  }

  @Get(':gameId')
  async get(@Req() request: AuthenticatedRequest, @Param('gameId', gameId()) id: string) {
    return { game: await this.games.snapshot(request.user.id, id) };
  }

  @Post(':gameId/moves')
  @HttpCode(200)
  async move(
    @Req() request: AuthenticatedRequest,
    @Param('gameId', gameId()) id: string,
    @Body(new SchemaValidationPipe(moveCommandSchema)) body: MoveCommandInput,
  ) {
    const ctx = this.context();
    return respond(await this.commands.move(request.user.id, id, body, ctx));
  }

  @Post(':gameId/resign')
  @HttpCode(200)
  async resign(
    @Req() request: AuthenticatedRequest,
    @Param('gameId', gameId()) id: string,
    @Body(new SchemaValidationPipe(simpleCommandSchema)) body: SimpleCommandInput,
  ) {
    const ctx = this.context();
    return respond(await this.commands.resign(request.user.id, id, body, ctx));
  }

  @Post(':gameId/draw-offer')
  @HttpCode(200)
  async offerDraw(
    @Req() request: AuthenticatedRequest,
    @Param('gameId', gameId()) id: string,
    @Body(new SchemaValidationPipe(simpleCommandSchema)) body: SimpleCommandInput,
  ) {
    const ctx = this.context();
    return respond(await this.commands.offerDraw(request.user.id, id, body, ctx));
  }

  @Post(':gameId/draw-offer/response')
  @HttpCode(200)
  async respondToDraw(
    @Req() request: AuthenticatedRequest,
    @Param('gameId', gameId()) id: string,
    @Body(new SchemaValidationPipe(drawResponseSchema)) body: DrawResponseInput,
  ) {
    const ctx = this.context();
    return respond(await this.commands.respondToDraw(request.user.id, id, body, ctx));
  }
}
