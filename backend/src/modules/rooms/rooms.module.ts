import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule, RealtimeModule, InvitationsModule, GamesModule],
  controllers: [RoomsController],
  providers: [RoomsService],
})
export class RoomsModule {}
