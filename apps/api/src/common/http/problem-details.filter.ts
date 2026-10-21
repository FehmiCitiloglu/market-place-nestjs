import { Catch, Inject, Injectable } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter, LoggerService } from '@nestjs/common';
import { APP_LOGGER } from '../../app.tokens.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { toProblemDetails } from './problem-details.js';

@Catch()
@Injectable()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();

    const requestId = typeof request.id === 'string' ? request.id : undefined;
    const problem = toProblemDetails(exception, {
      ...(requestId === undefined ? {} : { requestId }),
      instance: request.url,
    });

    if (problem.status >= 500) {
      this.logger.error(
        'unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
        'ProblemDetailsExceptionFilter',
      );
    }

    if (response.sent) return;
    void response
      .status(problem.status)
      .header('x-request-id', requestId ?? '')
      .type('application/problem+json; charset=utf-8')
      .send(problem);
  }
}
