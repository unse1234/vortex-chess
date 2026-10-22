import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from '../../common/guards/access-token.guard';
import type { AuthenticatedRequest } from '../../common/guards/access-token.guard';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
@Controller('session')
export class SessionController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}
  @Get()
  @UseGuards(AccessTokenGuard)
  current(@Req() request: AuthenticatedRequest) {
    return { user: request.user };
  }
  @Post('sign-out')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(this.cookies.read(request));
    this.cookies.clear(response);
  }
}
