import type { LoggerService } from '@nestjs/common';

/** Minimal structural view of the Fastify/pino logger instance. */
export interface PinoLikeLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
  fatal(obj: object, msg?: string): void;
  child(bindings: Record<string, unknown>): PinoLikeLogger;
}

/**
 * Routes Nest framework logging through the application's structured pino
 * logger so every log line shares the same JSON shape and redaction rules.
 */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: PinoLikeLogger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context: context ?? 'App' }, String(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context: context ?? 'App', trace }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context: context ?? 'App' }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context: context ?? 'App' }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.info({ context: context ?? 'App', verbosity: 'verbose' }, String(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context: context ?? 'App' }, String(message));
  }
}
