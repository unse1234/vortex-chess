import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { PasswordService } from './password.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordResetRepository } from './password-reset.repository';
import { SessionEventsService } from './session-events.service';
import { AuthController } from './auth.controller';
import { SessionController } from './session.controller';
@Module({
  imports: [UsersModule, MailModule, JwtModule.register({})],
  controllers: [AuthController, SessionController],
  providers: [
    AuthService,
    AuthCookieService,
    PasswordService,
    PasswordResetRepository,
    PasswordRecoveryService,
    SessionEventsService,
    AccessTokenGuard,
    CsrfGuard,
  ],
  exports: [AuthService, AccessTokenGuard, SessionEventsService],
})
export class AuthModule {}
