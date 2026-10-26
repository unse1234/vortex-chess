import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PresenceService } from './presence.service';
import { RealtimeChannels } from './realtime-channels.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime-publisher.service';

@Module({
  imports: [AuthModule],
  providers: [
    RealtimeGateway,
    PresenceService,
    RealtimeChannels,
    RealtimePublisher,
  ],
  exports: [PresenceService, RealtimeChannels, RealtimePublisher],
})
export class RealtimeModule {}
