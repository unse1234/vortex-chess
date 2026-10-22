import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Environment } from '../../config/environment';
import type { AuthSession } from '../../generated/prisma/client';
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  get name() {
    return this.config.get('COOKIE_SECURE', { infer: true })
      ? '__Host-vortix_refresh'
      : 'vortix_refresh';
  }
  private options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.config.get('COOKIE_SAME_SITE', { infer: true }),
      path: '/',
    };
  }
  read(request: Request): unknown {
    return (request.cookies as Record<string, unknown> | undefined)?.[
      this.name
    ];
  }
  set(response: Response, token: string, session: AuthSession) {
    response.cookie(this.name, token, {
      ...this.options(),
      ...(session.persistent ? { expires: session.expiresAt } : {}),
    });
  }
  clear(response: Response) {
    response.clearCookie(this.name, this.options());
  }
}
