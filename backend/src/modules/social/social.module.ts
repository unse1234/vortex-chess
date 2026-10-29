import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SocialController } from './social.controller';
import { SocialRepository } from './social.repository';
import { SocialService } from './social.service';

@Module({
  imports: [AuthModule, InvitationsModule, NotificationsModule, RealtimeModule],
  controllers: [SocialController],
  providers: [SocialRepository, SocialService],
})
export class SocialModule {}
