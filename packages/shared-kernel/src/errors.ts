/**
 * Application error taxonomy. Every error that can cross an HTTP boundary maps
 * to an RFC 9457 Problem Details response; internal causes are never exposed.
 */
export const ERROR_CODES = [
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'precondition_failed',
  'rate_limited',
  'payload_too_large',
  'unsupported_media_type',
  'idempotency_key_reused',
  'currency_mismatch',
  'invalid_state_transition',
  'internal_error',
  'service_unavailable',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppErrorOptions {
  status?: number;
  detail?: string;
  issues?: readonly ErrorIssue[];
  cause?: unknown;
  /** Extra machine-readable context safe to expose to clients. */
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ErrorIssue {
  readonly path: string;
  readonly message: string;
  readonly code?: string;
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  precondition_failed: 412,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  idempotency_key_reused: 409,
  currency_mismatch: 422,
  invalid_state_transition: 409,
  internal_error: 500,
  service_unavailable: 503,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues: readonly ErrorIssue[];
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status ?? DEFAULT_STATUS[code];
    this.issues = options.issues ?? [];
    this.metadata = options.metadata ?? {};
  }
}

export class ValidationError extends AppError {
  constructor(message = 'request validation failed', issues: readonly ErrorIssue[] = []) {
    super('validation_failed', message, { status: 422, issues });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'authentication required') {
    super('unauthenticated', message, { status: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'insufficient permissions for this operation') {
    super('forbidden', message, { status: 403 });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'resource') {
    super('not_found', `${resource} not found`, { status: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('conflict', message, { status: 409 });
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super('invalid_state_transition', `invalid ${entity} state transition: ${from} -> ${to}`, {
      status: 409,
      metadata: { entity, from, to },
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
