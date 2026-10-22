import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/auth.service';
import { ApiException } from '../errors/api-exception';
export type AuthenticatedRequest = Request & {
  user: Awaited<ReturnType<AuthService['authenticate']>>;
};
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^ ]+)$/.exec(request.get('Authorization') ?? '');
    if (!match)
      throw new ApiException(401, 'unauthenticated', 'Sign in to continue.');
    request.user = await this.auth.authenticate(match[1]);
    return true;
  }
}
