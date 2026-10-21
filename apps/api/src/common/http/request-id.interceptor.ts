import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { tap, type Observable } from 'rxjs';

/** Echoes the request id on every response and makes it available for logs. */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const requestId = typeof request.id === 'string' ? request.id : '';
    return next.handle().pipe(
      tap(() => {
        if (!response.sent) {
          void response.header('x-request-id', requestId);
        }
      }),
    );
  }
}
