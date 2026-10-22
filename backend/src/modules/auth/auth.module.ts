import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { PasswordService } from './password.service';
import { AuthController } from './auth.controller';
import { SessionController } from './session.controller';
@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController, SessionController],
  providers: [
    AuthService,
    AuthCookieService,
    PasswordService,
    AccessTokenGuard,
    CsrfGuard,
  ],
  exports: [AuthService, AccessTokenGuard],
})
export class AuthModule {}
