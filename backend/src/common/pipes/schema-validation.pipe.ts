import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { ApiException } from '../errors/api-exception';
export class SchemaValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodType) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0]?.toString() ?? 'request';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ApiException(
      400,
      'validation_error',
      'Please check the supplied details.',
      fieldErrors,
    );
  }
}
