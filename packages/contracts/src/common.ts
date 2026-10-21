/// <reference types="zod-openapi" />
import { z } from 'zod';
import { ERROR_CODES, SUPPORTED_CURRENCIES } from '@mercato/shared-kernel';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const uuidSchema = z.string().regex(UUID_PATTERN, 'must be a UUID').meta({
  id: 'Uuid',
  description: 'UUID identifier (UUIDv7 for server-generated ids)',
  example: '01890a5d-ac96-774b-bcce-b302099a8057',
});

export const isoDateTimeSchema = z.iso.datetime().meta({
  id: 'IsoDateTime',
  description: 'ISO-8601 UTC timestamp',
  example: '2026-01-01T12:00:00.000Z',
});

export const currencySchema = z
  .enum(SUPPORTED_CURRENCIES)
  .meta({ id: 'Currency', description: 'ISO-4217 currency code (fixed demo set)' });

/**
 * Money is serialized as a string of integer minor units because JSON numbers
 * cannot represent bigint values safely. Never a floating-point number.
 */
export const moneySchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^-?\d+$/, 'must be an integer number of minor units')
      .meta({ description: 'Integer minor units (e.g. cents) as a string', example: '1299' }),
    currency: currencySchema,
  })
  .meta({ id: 'Money' });

export const errorIssueSchema = z
  .object({
    path: z.string().meta({ description: 'Location of the failing input, e.g. "body.email"' }),
    message: z.string(),
    code: z.string().optional(),
  })
  .meta({ id: 'ErrorIssue' });

/** RFC 9457 Problem Details with a stable machine-readable error code. */
export const problemDetailsSchema = z
  .object({
    type: z
      .string()
      .meta({ description: 'URI reference identifying the problem type', example: 'about:blank' }),
    title: z.string().meta({ example: 'Validation failed' }),
    status: z.number().int().meta({ example: 422 }),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.enum(ERROR_CODES).meta({ description: 'Stable machine-readable error code' }),
    requestId: z
      .string()
      .optional()
      .meta({ description: 'Correlates with server logs and traces' }),
    issues: z.array(errorIssueSchema).optional(),
  })
  .meta({ id: 'ProblemDetails' });

export const paginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .transform((value) => value ?? 20)
    .meta({ description: 'Page size (1-100), default 20' }),
  cursor: z
    .string()
    .min(1)
    .max(2048)
    .optional()
    .meta({ description: 'Opaque cursor from a previous page; tamper-evident and expiring' }),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function pageSchema<T extends z.ZodType>(itemSchema: T, id: string) {
  return z
    .object({
      items: z.array(itemSchema),
      nextCursor: z.string().nullable(),
      hasMore: z.boolean(),
    })
    .meta({ id });
}
