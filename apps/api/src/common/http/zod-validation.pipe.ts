import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ValidationError, type ErrorIssue } from '@mercato/shared-kernel';

/**
 * Validates a request part against a zod schema at the HTTP trust boundary.
 * Unknown keys are stripped by the schema (strict object schemas reject them).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues: ErrorIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.map((segment) => String(segment)).join('.') || '(root)',
        message: issue.message,
        code: issue.code,
      }));
      throw new ValidationError('request validation failed', issues);
    }
    return result.data;
  }
}

/** Shorthand for `@Body(zodPipe(schema))` / `@Query(zodPipe(schema))`. */
export function zodPipe(schema: ZodType): ZodValidationPipe {
  return new ZodValidationPipe(schema);
}
