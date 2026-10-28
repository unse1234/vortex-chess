import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../common/guards/access-token.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { RatingsReadService } from './ratings-read.service';
import {
  emptyQuerySchema,
  leaderboardSchema,
  positionSchema,
  ratingHistorySchema,
  type LeaderboardInput,
  type RatingHistoryInput,
} from './ratings.schemas';
import type { Pool } from './rating-policy';

@Controller()
@UseGuards(AccessTokenGuard)
export class RatingsController {
  constructor(private readonly reads: RatingsReadService) {}
  @Get('ratings/me') mine(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(emptyQuerySchema))
    _query: Record<string, never>,
  ) {
    return this.reads.mine(req.user.id);
  }
  @Get('ratings/me/history') history(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(ratingHistorySchema))
    query: RatingHistoryInput,
  ) {
    return this.reads.history(req.user.id, query);
  }
  @Get('leaderboard') leaderboard(
    @Query(new SchemaValidationPipe(leaderboardSchema)) query: LeaderboardInput,
  ) {
    return this.reads.leaderboard(query);
  }
  @Get('leaderboard/me') position(
    @Req() req: AuthenticatedRequest,
    @Query(new SchemaValidationPipe(positionSchema)) query: { pool: Pool },
  ) {
    return this.reads.position(req.user.id, query.pool);
  }
}
