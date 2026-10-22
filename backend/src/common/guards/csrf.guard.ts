import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Environment } from '../../config/environment';
import { ApiException } from '../errors/api-exception';
/** Exact Origin allowlist + a non-simple custom header protect cookie-authenticated mutations. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.get('Origin');
    if (
      !origin ||
      !this.config.get('CORS_ORIGINS', { infer: true }).includes(origin) ||
      request.get('X-Vortix-CSRF') !== '1'
    ) {
      throw new ApiException(
        403,
        'csrf_rejected',
        'The request origin or CSRF header is invalid.',
      );
    }
    return true;
  }
}
