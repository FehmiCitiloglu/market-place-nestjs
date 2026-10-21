import { describe, expect, it } from 'vitest';
import {
  buildOpenApiDocument,
  moneySchema,
  paginationQuerySchema,
  problemDetailsSchema,
} from '../src/index.js';

describe('contract schemas', () => {
  it('money is integer minor units as a string, never a float', () => {
    expect(moneySchema.parse({ amountMinor: '1299', currency: 'USD' })).toEqual({
      amountMinor: '1299',
      currency: 'USD',
    });
    expect(moneySchema.safeParse({ amountMinor: '12.99', currency: 'USD' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: 1299, currency: 'USD' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: '1299', currency: 'XXX' }).success).toBe(false);
    expect(moneySchema.safeParse({ amountMinor: '-5', currency: 'JPY' }).success).toBe(true);
  });

  it('pagination query coerces and bounds the limit', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(paginationQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5 });
    expect(paginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: 'abc' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ cursor: 'x'.repeat(5000) }).success).toBe(false);
  });

  it('problem details uses stable error codes', () => {
    const parsed = problemDetailsSchema.parse({
      type: 'about:blank',
      title: 'Validation failed',
      status: 422,
      code: 'validation_failed',
      requestId: 'req-1',
      issues: [{ path: 'body.email', message: 'invalid email' }],
    });
    expect(parsed.code).toBe('validation_failed');
    expect(
      problemDetailsSchema.safeParse({
        type: 'about:blank',
        title: 'x',
        status: 500,
        code: 'made_up',
      }).success,
    ).toBe(false);
  });
});

describe('OpenAPI document', () => {
  const document = buildOpenApiDocument({ version: '0.1.0', environment: 'test' });

  it('is an OpenAPI 3.1 document generated from the shared schemas', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info?.title).toBe('Mercato API');
    expect(document.paths?.['/health/live']).toBeDefined();
    expect(document.paths?.['/health/ready']).toBeDefined();
    expect(document.paths?.['/health/startup']).toBeDefined();
    expect(document.paths?.['/api/v1']).toBeDefined();
  });

  it('references shared component schemas', () => {
    const components = document.components?.schemas as Record<string, unknown> | undefined;
    // Only schemas referenced by documented endpoints are emitted; Money
    // enters the document with the first monetary endpoint (catalog/checkout).
    expect(components?.['ProblemDetails']).toBeDefined();
    expect(components?.['LivenessResponse']).toBeDefined();
    expect(components?.['ReadinessResponse']).toBeDefined();
    expect(document.components?.securitySchemes?.['sessionCookie']).toBeDefined();
    expect(document.components?.securitySchemes?.['csrfToken']).toBeDefined();
  });

  it('describes error responses with problem+json', () => {
    const operation = document.paths?.['/api/v1']?.get as unknown;
    expect(operation).toBeDefined();
    const serialized = JSON.stringify(operation);
    expect(serialized).toContain('application/problem+json');
  });
});
