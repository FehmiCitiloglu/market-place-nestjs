import type { FastifyError } from 'fastify';
import { HttpException } from '@nestjs/common';
import { ZodError } from 'zod';
import { isAppError, type ErrorCode, type ErrorIssue } from '@mercato/shared-kernel';
import { problemDetailsSchema } from '@mercato/contracts';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ErrorCode;
  requestId?: string;
  issues?: ErrorIssue[];
}

const PROBLEM_TYPE_PREFIX = 'urn:mercato:problem:';

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthenticated',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Validation Failed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function formatExceptionMessage(message: unknown): string {
  return Array.isArray(message)
    ? message.map((entry: unknown) => String(entry)).join('; ')
    : String(message);
}

function statusCodeToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'validation_failed';
    case 401:
      return 'unauthenticated';
    case 403:
      return 'forbidden';
    case 404:
    case 405:
      return 'not_found';
    case 409:
      return 'conflict';
    case 412:
      return 'precondition_failed';
    case 413:
      return 'payload_too_large';
    case 415:
      return 'unsupported_media_type';
    case 429:
      return 'rate_limited';
    case 503:
      return 'service_unavailable';
    default:
      return status >= 500 ? 'internal_error' : 'validation_failed';
  }
}

function mapZodIssues(error: ZodError): ErrorIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

function fastifyErrorToCode(error: FastifyError): ErrorCode | null {
  switch (error.code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
    case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
      return 'payload_too_large';
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
    case 'FST_ERR_CTP_UNSUPPORTED_MEDIA_TYPE':
      return 'unsupported_media_type';
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
      return 'validation_failed';
    default:
      return null;
  }
}

function isFastifyError(error: unknown): error is FastifyError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('FST_')
  );
}

/**
 * Map any thrown value to RFC 9457 Problem Details.
 *
 * Unknown errors collapse to a generic 500: internal messages and stacks are
 * never exposed to clients (they are logged server-side instead).
 */
export function toProblemDetails(
  exception: unknown,
  context: { requestId?: string; instance?: string } = {},
): ProblemDetails {
  const requestId = context.requestId;
  const instance = context.instance;

  if (isAppError(exception)) {
    const problem: ProblemDetails = {
      type: `${PROBLEM_TYPE_PREFIX}${exception.code}`,
      title: STATUS_TITLES[exception.status] ?? 'Error',
      status: exception.status,
      detail: exception.message,
      code: exception.code,
    };
    if (requestId !== undefined) problem.requestId = requestId;
    if (instance !== undefined) problem.instance = instance;
    if (exception.issues.length > 0) problem.issues = [...exception.issues];
    return problem;
  }

  if (exception instanceof HttpException) {
    // Framework exceptions (not-found handler, guards, built-in pipes) keep
    // their status and message but always surface as Problem Details.
    const status = exception.getStatus();
    const response = exception.getResponse();
    const detail =
      typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'message' in response
          ? formatExceptionMessage(response.message)
          : exception.message;
    const problem: ProblemDetails = {
      type: `${PROBLEM_TYPE_PREFIX}${statusCodeToErrorCode(status)}`,
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail,
      code: statusCodeToErrorCode(status),
    };
    if (requestId !== undefined) problem.requestId = requestId;
    if (instance !== undefined) problem.instance = instance;
    return problem;
  }

  if (exception instanceof ZodError) {
    const problem: ProblemDetails = {
      type: `${PROBLEM_TYPE_PREFIX}validation_failed`,
      title: 'Validation Failed',
      status: 422,
      detail: 'request validation failed',
      code: 'validation_failed',
      issues: mapZodIssues(exception),
    };
    if (requestId !== undefined) problem.requestId = requestId;
    if (instance !== undefined) problem.instance = instance;
    return problem;
  }

  if (isFastifyError(exception)) {
    const statusCode = typeof exception.statusCode === 'number' ? exception.statusCode : 500;
    const code =
      fastifyErrorToCode(exception) ?? (statusCode >= 500 ? 'internal_error' : 'validation_failed');
    const status = statusCode >= 400 ? statusCode : 500;
    const problem: ProblemDetails = {
      type: `${PROBLEM_TYPE_PREFIX}${code}`,
      title: STATUS_TITLES[status] ?? 'Error',
      status,
      detail: code === 'internal_error' ? 'An unexpected error occurred.' : exception.message,
      code,
    };
    if (requestId !== undefined) problem.requestId = requestId;
    if (instance !== undefined) problem.instance = instance;
    return problem;
  }

  const problem: ProblemDetails = {
    type: `${PROBLEM_TYPE_PREFIX}internal_error`,
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred.',
    code: 'internal_error',
  };
  if (requestId !== undefined) problem.requestId = requestId;
  if (instance !== undefined) problem.instance = instance;
  return problem;
}

/** Runtime guard used in tests: keeps the response shape aligned with the contract. */
export function isProblemDetails(value: unknown): value is ProblemDetails {
  return problemDetailsSchema.safeParse(value).success;
}
