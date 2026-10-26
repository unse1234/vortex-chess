import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnginesModule } from '../engines/engines.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ServerClock } from './clocks/server-clock';
import { EngineGamesController } from './engine-games.controller';
import { GamesController } from './games.controller';
import { GamesGateway } from './games.gateway';
import { GamesService } from './games.service';
import { EngineTurnService } from './services/engine-turns.service';
import { GameCommandsService } from './services/game-commands.service';
import { GameMetrics } from './services/game-metrics';
import { GameRepository } from './services/game-repository';
import { GameStore } from './services/game-store';
import { GameHistoryService } from './services/game-history.service';
import { AnalysisPreviewService } from './services/analysis-preview.service';

@Module({
  imports: [AuthModule, RealtimeModule, EnginesModule],
  controllers: [GamesController, EngineGamesController],
  providers: [
    GameHistoryService,
    AnalysisPreviewService,
    ServerClock,
    GameRepository,
    GameStore,
    GameMetrics,
    GameCommandsService,
    EngineTurnService,
    GamesService,
    GamesGateway,
  ],
  exports: [GamesService],
})
export class GamesModule {}
