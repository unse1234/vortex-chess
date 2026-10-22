import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const transportStatus =
      typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : undefined;
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : transportStatus === 400 || transportStatus === 413
          ? transportStatus
          : 500;
    const body =
      error instanceof HttpException ? error.getResponse() : undefined;
    if (status >= 500)
      this.logger.error(
        'Request failed',
        error instanceof Error ? error.name : 'UnknownError',
      );
    const defaults: Record<number, [string, string]> = {
      400: ['invalid_request', 'The request is invalid.'],
      401: ['unauthenticated', 'Sign in to continue.'],
      403: ['forbidden', 'This request is not permitted.'],
      404: ['not_found', 'This endpoint does not exist.'],
      413: ['payload_too_large', 'The request is too large.'],
      503: ['service_unavailable', 'The service is temporarily unavailable.'],
      429: ['rate_limited', 'Too many requests. Please try again later.'],
    };
    const [code, message] = defaults[status] ?? [
      'server_error',
      'The server could not complete this request.',
    ];
    const usable = typeof body === 'object' && body !== null && 'code' in body;
    response.status(status).json(usable ? body : { code, message });
  }
}
