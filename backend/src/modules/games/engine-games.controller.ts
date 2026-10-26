import { Body, Controller, Get, Header, Post, Req, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { createEngineGameSchema, type CreateEngineGameInput } from './games.schemas';
import { GamesService } from './games.service';

/**
 * Games against the engine service. The browser only talks to this API; the
 * engine service is reached by the backend alone. Moves, resignation and
 * snapshots then use the ordinary game endpoints and realtime channel.
 */
@Controller('engine-games')
@UseGuards(AccessTokenGuard)
export class EngineGamesController {
  constructor(private readonly games: GamesService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status() {
    return this.games.engineStatus();
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(createEngineGameSchema)) body: CreateEngineGameInput,
  ) {
    return { game: await this.games.createEngineGame(request.user.id, body) };
  }
}
