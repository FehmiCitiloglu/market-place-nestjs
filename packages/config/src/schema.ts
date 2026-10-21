import { z } from 'zod';

/**
 * Flat environment schema. Every value arrives as a string from the
 * environment; the schema coerces and validates at startup so misconfiguration
 * fails fast instead of surfacing as runtime errors later.
 *
 * Validation errors report variable NAMES only — values are never echoed,
 * because environment values can contain secrets.
 */
const boolEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true' || value === '1'));

const intEnv = (defaultValue: number, min = 1, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .optional()
    .transform((value) => value ?? defaultValue);

const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value));

export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .optional()
    .transform((v) => v ?? 'development'),

  API_HOST: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => v ?? '0.0.0.0'),
  API_PORT: intEnv(3000, 1, 65535),
  API_BODY_LIMIT_BYTES: intEnv(1_048_576, 1024, 10 * 1024 * 1024),
  API_TRUST_PROXY: boolEnv(false),
  API_CORS_ALLOWED_ORIGINS: optionalString,

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .transform((v) => v ?? 'info'),
  LOG_PRETTY: boolEnv(false),

  DATABASE_URL: z.url({ protocol: /^postgres$/ }),
  DATABASE_POOL_MAX: intEnv(10, 1, 500),
  DATABASE_MIGRATION_URL: z.url({ protocol: /^postgres$/ }).optional(),

  REDIS_URL: z.url({ protocol: /^redis$/ }),

  SESSION_COOKIE_NAME: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => v ?? 'mercato_session'),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: intEnv(604_800, 60, 90 * 24 * 60 * 60),
  SESSION_IDLE_TIMEOUT_SECONDS: intEnv(86_400, 60, 90 * 24 * 60 * 60),
  CSRF_COOKIE_NAME: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => v ?? 'mercato_csrf'),

  S3_ENDPOINT: z.url(),
  S3_REGION: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => v ?? 'us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(16),
  S3_BUCKET_PUBLIC: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  S3_BUCKET_PRIVATE: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  S3_FORCE_PATH_STYLE: boolEnv(true),

  MAIL_TRANSPORT: z
    .enum(['smtp', 'noop'])
    .optional()
    .transform((v) => v ?? 'smtp'),
  MAIL_SMTP_HOST: optionalString,
  MAIL_SMTP_PORT: intEnv(1025, 1, 65535),
  MAIL_FROM: z
    .string()
    .trim()
    .min(3)
    .optional()
    .transform((v) => v ?? 'Mercato <no-reply@mercato.local>'),

  PAYMENT_PROVIDER: z
    .enum(['mock'])
    .optional()
    .transform((v) => v ?? 'mock'),
  PAYMENT_WEBHOOK_SECRET: z.string().min(32),

  RATE_LIMIT_ENABLED: boolEnv(true),
  RATE_LIMIT_MAX: intEnv(300, 1, 1_000_000),
  RATE_LIMIT_WINDOW_SECONDS: intEnv(60, 1, 3600),

  OTEL_ENABLED: boolEnv(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalString,
});

export type Environment = z.infer<typeof environmentSchema>;

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  api: {
    host: string;
    port: number;
    bodyLimitBytes: number;
    trustProxy: boolean;
    corsAllowedOrigins: readonly string[];
  };
  log: {
    level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
    pretty: boolean;
  };
  database: {
    url: string;
    migrationUrl: string;
    poolMax: number;
  };
  redis: {
    url: string;
  };
  session: {
    cookieName: string;
    secret: string;
    ttlSeconds: number;
    idleTimeoutSeconds: number;
    csrfCookieName: string;
  };
  storage: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketPublic: string;
    bucketPrivate: string;
    forcePathStyle: boolean;
  };
  mail: {
    transport: 'smtp' | 'noop';
    smtpHost: string;
    smtpPort: number;
    from: string;
  };
  payments: {
    provider: 'mock';
    webhookSecret: string;
  };
  rateLimit: {
    enabled: boolean;
    max: number;
    windowSeconds: number;
  };
  observability: {
    otelEnabled: boolean;
    otlpEndpoint: string | null;
  };
}

export class ConfigValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`configuration validation failed:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}
