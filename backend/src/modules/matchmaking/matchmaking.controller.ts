import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import {
  joinMatchmakingSchema,
  searchCommandSchema,
  type JoinMatchmakingInput,
  type SearchCommandInput,
} from './matchmaking.schemas';
import { MatchmakingService } from './matchmaking.service';

@Controller('matchmaking')
@UseGuards(AccessTokenGuard)
export class MatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}
  @Get('options') options() {
    return this.matchmaking.options();
  }
  @Get() status(@Req() req: AuthenticatedRequest) {
    return this.matchmaking.status(req.user.id);
  }
  @Post('join')
  @HttpCode(200)
  join(
    @Req() req: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(joinMatchmakingSchema))
    body: JoinMatchmakingInput,
  ) {
    return this.matchmaking.join(req.user.id, body);
  }
  @Post('cancel')
  @HttpCode(200)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(searchCommandSchema))
    body: SearchCommandInput,
  ) {
    return this.matchmaking.cancel(req.user.id, body.searchId);
  }
  @Post('ready')
  @HttpCode(200)
  ready(
    @Req() req: AuthenticatedRequest,
    @Body(new SchemaValidationPipe(searchCommandSchema))
    body: SearchCommandInput,
  ) {
    return this.matchmaking.ready(req.user.id, body.searchId);
  }
}
