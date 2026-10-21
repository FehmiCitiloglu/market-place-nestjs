import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  isAppError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../src/errors.js';

describe('error taxonomy', () => {
  it('maps codes to default HTTP statuses', () => {
    expect(new ValidationError().status).toBe(422);
    expect(new UnauthenticatedError().status).toBe(401);
    expect(new ForbiddenError().status).toBe(403);
    expect(new NotFoundError('order').status).toBe(404);
    expect(new ConflictError('x').status).toBe(409);
    expect(new AppError('rate_limited', 'slow down').status).toBe(429);
  });

  it('carries machine-readable issues and metadata', () => {
    const error = new ValidationError('bad input', [
      { path: 'body.email', message: 'invalid email' },
    ]);
    expect(error.issues).toHaveLength(1);
    expect(error.code).toBe('validation_failed');
    const transition = new InvalidStateTransitionError('order', 'PAID', 'PENDING_PAYMENT');
    expect(transition.metadata).toEqual({ entity: 'order', from: 'PAID', to: 'PENDING_PAYMENT' });
  });

  it('isAppError narrows correctly', () => {
    expect(isAppError(new AppError('internal_error', 'boom'))).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('string')).toBe(false);
  });

  it('keeps the concrete class name for logs', () => {
    expect(new NotFoundError('product').name).toBe('NotFoundError');
  });
});
