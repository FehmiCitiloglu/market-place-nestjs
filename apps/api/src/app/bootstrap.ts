import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from '@mercato/config';
import { newUuidV7, AppError } from '@mercato/shared-kernel';

import { AppModule } from './app.module.js';
import { ProblemDetailsExceptionFilter } from '../common/http/problem-details.filter.js';
import { RequestIdInterceptor } from '../common/http/request-id.interceptor.js';
import { NestPinoLogger } from '../common/logging/nest-pino.logger.js';
import { HealthService } from '../modules/health/health.service.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
];

export interface CreateAppResult {
  app: NestFastifyApplication;
  fastify: FastifyInstance;
}

type FastifyLoggerConfig = Exclude<Exclude<FastifyServerOptions['logger'], boolean>, undefined>;

function buildLoggerOptions(config: AppConfig): FastifyLoggerConfig {
  const base = {
    level: config.log.level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  };
  if (!config.log.pretty) {
    return base;
  }
  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  };
}

function swaggerUiDistDir(): string {
  const require = createRequire(import.meta.url);
  return dirname(require.resolve('swagger-ui-dist/package.json'));
}

/**
 * Builds the Nest application wired to Fastify with the platform-level
 * concerns handled once: logging, security headers, CORS, cookies, rate
 * limiting, request ids, Problem Details errors, OpenAPI docs and graceful
 * shutdown. Route-level auth/validation lives in each module.
 */
export async function createApp(config: AppConfig): Promise<CreateAppResult> {
  const fastify = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: config.api.trustProxy,
    bodyLimit: config.api.bodyLimitBytes,
    // Request-id generation is owned by genReqId so that client-supplied
    // values are validated before use (never reflected unvalidated).
    requestIdHeader: false,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      const value = Array.isArray(header) ? header[0] : header;
      return value !== undefined && REQUEST_ID_PATTERN.test(value) ? value : newUuidV7();
    },
  });

  const adapter = new FastifyAdapter(fastify);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    adapter,
    {
      logger: false,
      // A server must never abort its process on an initialization error:
      // rethrow so the caller can log and exit cleanly.
      abortOnError: false,
    },
  );

  const logger = new NestPinoLogger(fastify.log);
  app.useLogger(logger);
  app.useGlobalFilters(new ProblemDetailsExceptionFilter(logger));
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // --- security headers (strict CSP; docs UI needs inline styles only) ---
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    ...(config.env === 'production'
      ? { hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false } }
      : {}),
  });

  // --- CORS: explicit allowlist only; no wildcard for authenticated APIs ---
  if (config.api.corsAllowedOrigins.length > 0) {
    const allowed = new Set(config.api.corsAllowedOrigins);
    await app.register(fastifyCors, {
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['content-type', 'x-csrf-token', 'x-request-id', 'idempotency-key'],
      exposedHeaders: ['x-request-id', 'retry-after'],
      maxAge: 600,
      origin: (origin, callback) => {
        // Same-origin requests and non-browser clients send no Origin header.
        if (origin === undefined || allowed.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError('forbidden', 'origin not allowed', { status: 403 }), false);
      },
    });
  }

  await app.register(fastifyCookie, {
    secret: config.session.secret,
    parseOptions: {
      sameSite: 'lax',
      httpOnly: true,
      secure: config.env === 'production',
      path: '/',
    },
  });

  await app.register(fastifyRateLimit, {
    global: config.rateLimit.enabled,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowSeconds * 1000,
    // Health probes are driven by orchestrators, not users: allow-listed
    // requests are neither counted nor limited.
    allowList: (request) => request.url.startsWith('/health/'),
    // The plugin throws the builder's return value, so returning an AppError
    // routes the 429 through the shared Problem Details error surface.
    errorResponseBuilder: (_request, context) =>
      new AppError(
        'rate_limited',
        `rate limit exceeded: at most ${String(context.max)} requests per window`,
        {
          status: 429,
        },
      ),
  });

  // --- offline Swagger UI (production: docs disabled in DocsController) ---
  await app.register(fastifyStatic, {
    root: swaggerUiDistDir(),
    prefix: '/docs-static/',
    decorateReply: false,
    index: false,
    list: false,
  });

  // Fastify-level errors (payload too large, unsupported media type, plugin
  // failures) flow through Nest's Fastify error handler into the global
  // ProblemDetailsExceptionFilter, so all errors share one Problem Details
  // surface (verified by test/integration/http-hardening.test.ts).

  // Unknown routes are handled by Nest's not-found handler, which throws
  // NotFoundException through the exception filter (Problem Details).

  app.enableShutdownHooks();

  const healthService = app.get(HealthService, { strict: false });
  healthService.markInitialized();

  return { app, fastify };
}
