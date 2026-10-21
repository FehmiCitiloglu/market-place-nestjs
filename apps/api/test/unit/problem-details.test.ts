import { describe, expect, it } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  AppError,
} from '@mercato/shared-kernel';
import { isProblemDetails, toProblemDetails } from '../../src/common/http/problem-details.js';

describe('toProblemDetails', () => {
  it('maps AppError subclasses to RFC 9457 problem details', () => {
    const problem = toProblemDetails(new NotFoundError('order'), {
      requestId: 'req-1',
      instance: '/api/v1/orders/1',
    });
    expect(problem).toMatchObject({
      type: 'urn:mercato:problem:not_found',
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      detail: 'order not found',
      requestId: 'req-1',
      instance: '/api/v1/orders/1',
    });
    expect(isProblemDetails(problem)).toBe(true);
  });

  it('maps validation errors with field issues', () => {
    const problem = toProblemDetails(
      new ValidationError('request validation failed', [
        { path: 'body.email', message: 'invalid email' },
      ]),
    );
    expect(problem.status).toBe(422);
    expect(problem.code).toBe('validation_failed');
    expect(problem.issues).toEqual([{ path: 'body.email', message: 'invalid email' }]);
  });

  it('maps ZodError to 422 with issue paths', () => {
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 'nope' });
    if (result.success) throw new Error('expected failure');
    const problem = toProblemDetails(result.error);
    expect(problem.status).toBe(422);
    expect(problem.code).toBe('validation_failed');
    expect(problem.issues?.[0]?.path).toBe('email');
    expect(isProblemDetails(problem)).toBe(true);
  });

  it('maps Fastify transport errors to explicit codes', () => {
    const tooLarge = Object.assign(new Error('body too large'), {
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
      statusCode: 413,
    });
    const problem = toProblemDetails(tooLarge);
    expect(problem.status).toBe(413);
    expect(problem.code).toBe('payload_too_large');

    const badMedia = Object.assign(new Error('unsupported media type'), {
      code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      statusCode: 415,
    });
    expect(toProblemDetails(badMedia).code).toBe('unsupported_media_type');
    expect(isProblemDetails(problem)).toBe(true);
  });

  it('never leaks internal error messages for unknown failures', () => {
    const problem = toProblemDetails(new Error('SELECT * FROM users WHERE secret = ...'), {
      requestId: 'req-2',
    });
    expect(problem).toMatchObject({ status: 500, code: 'internal_error', requestId: 'req-2' });
    expect(problem.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(problem)).not.toContain('secret');
  });

  it('maps Nest framework exceptions (not-found handler, guards, pipes)', () => {
    const problem = toProblemDetails(new NotFoundException('Cannot GET /api/v1/nope'), {
      requestId: 'req-3',
      instance: '/api/v1/nope',
    });
    expect(problem.status).toBe(404);
    expect(problem.code).toBe('not_found');
    expect(problem.detail).toBe('Cannot GET /api/v1/nope');
    expect(problem.requestId).toBe('req-3');

    const badRequest = toProblemDetails(new BadRequestException(['email must be an email']));
    expect(badRequest.status).toBe(400);
    expect(badRequest.code).toBe('validation_failed');
    expect(badRequest.detail).toBe('email must be an email');
    expect(isProblemDetails(problem)).toBe(true);
  });

  it('maps auth and conflict errors', () => {
    expect(toProblemDetails(new UnauthenticatedError()).status).toBe(401);
    expect(toProblemDetails(new ConflictError('already exists')).status).toBe(409);
    expect(toProblemDetails(new AppError('rate_limited', 'slow down')).status).toBe(429);
    expect(isProblemDetails(toProblemDetails('string error'))).toBe(true);
  });
});
