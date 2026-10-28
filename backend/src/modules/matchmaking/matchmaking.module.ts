import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingsModule } from '../ratings/ratings.module';
import { GamesModule } from '../games/games.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';

@Module({
  imports: [AuthModule, GamesModule, RealtimeModule, RatingsModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
})
export class MatchmakingModule {}
