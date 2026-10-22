import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CsrfGuard } from '../../common/guards/csrf.guard';
import { SchemaValidationPipe } from '../../common/pipes/schema-validation.pipe';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { loginSchema, registerSchema, usernameSchema } from './auth.schemas';
import type { LoginInput, RegisterInput } from './auth.schemas';
@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
    private readonly users: UsersService,
  ) {}
  @Post('sign-up')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body(new SchemaValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.register(body);
    this.cookies.set(response, result.refreshToken, result.session);
    return result.body;
  }
  @Post('sign-in')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async login(
    @Body(new SchemaValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body);
    this.cookies.set(response, result.refreshToken, result.session);
    return result.body;
  }
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const result = await this.auth.refresh(this.cookies.read(request));
      this.cookies.set(response, result.refreshToken, result.session);
      return result.body;
    } catch (error) {
      if (
        error instanceof Error &&
        'getStatus' in error &&
        typeof error.getStatus === 'function' &&
        error.getStatus() === 401
      )
        this.cookies.clear(response);
      throw error;
    }
  }
  @Get('username-availability')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  usernameAvailable(
    @Query(
      new SchemaValidationPipe(z.object({ username: usernameSchema }).strict()),
    )
    query: {
      username: string;
    },
  ) {
    return this.users.usernameAvailable(query.username);
  }
}
