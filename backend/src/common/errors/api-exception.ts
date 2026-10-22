import { HttpException } from '@nestjs/common';
export class ApiException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super({ code, message, ...(fieldErrors ? { fieldErrors } : {}) }, status);
  }
}
