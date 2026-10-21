import {
  environmentSchema,
  type AppConfig,
  type Environment,
  ConfigValidationError,
} from './schema.js';

/** Environment variable names whose values must never appear in logs. */
export const SECRET_ENV_KEYS = [
  'SESSION_SECRET',
  'S3_SECRET_ACCESS_KEY',
  'PAYMENT_WEBHOOK_SECRET',
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'REDIS_URL',
] as const;

function splitOrigins(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function toAppConfig(environment: Environment): AppConfig {
  return {
    env: environment.NODE_ENV,
    api: {
      host: environment.API_HOST,
      port: environment.API_PORT,
      bodyLimitBytes: environment.API_BODY_LIMIT_BYTES,
      trustProxy: environment.API_TRUST_PROXY,
      corsAllowedOrigins: splitOrigins(environment.API_CORS_ALLOWED_ORIGINS),
    },
    log: {
      level: environment.LOG_LEVEL,
      pretty: environment.LOG_PRETTY,
    },
    database: {
      url: environment.DATABASE_URL,
      migrationUrl: environment.DATABASE_MIGRATION_URL ?? environment.DATABASE_URL,
      poolMax: environment.DATABASE_POOL_MAX,
    },
    redis: {
      url: environment.REDIS_URL,
    },
    session: {
      cookieName: environment.SESSION_COOKIE_NAME,
      secret: environment.SESSION_SECRET,
      ttlSeconds: environment.SESSION_TTL_SECONDS,
      idleTimeoutSeconds: environment.SESSION_IDLE_TIMEOUT_SECONDS,
      csrfCookieName: environment.CSRF_COOKIE_NAME,
    },
    storage: {
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
      bucketPublic: environment.S3_BUCKET_PUBLIC,
      bucketPrivate: environment.S3_BUCKET_PRIVATE,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
    },
    mail: {
      transport: environment.MAIL_TRANSPORT,
      smtpHost: environment.MAIL_SMTP_HOST ?? 'localhost',
      smtpPort: environment.MAIL_SMTP_PORT,
      from: environment.MAIL_FROM,
    },
    payments: {
      provider: environment.PAYMENT_PROVIDER,
      webhookSecret: environment.PAYMENT_WEBHOOK_SECRET,
    },
    rateLimit: {
      enabled: environment.RATE_LIMIT_ENABLED,
      max: environment.RATE_LIMIT_MAX,
      windowSeconds: environment.RATE_LIMIT_WINDOW_SECONDS,
    },
    observability: {
      otelEnabled: environment.OTEL_ENABLED,
      otlpEndpoint: environment.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    },
  };
}

/**
 * Validate the environment and build the typed application configuration.
 * Throws ConfigValidationError listing offending variable NAMES (never values).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const candidate: Record<string, string | undefined> = {};
  for (const key of Object.keys(environmentSchema.shape)) {
    candidate[key] = env[key];
  }
  const result = environmentSchema.safeParse(candidate);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      return `${name}: ${issue.message}`;
    });
    throw new ConfigValidationError(issues);
  }
  return toAppConfig(result.data);
}

/** Mask credential-bearing values so configuration can be logged safely. */
export function redactConfig(config: AppConfig): Record<string, unknown> {
  return {
    env: config.env,
    api: { ...config.api, corsAllowedOrigins: [...config.api.corsAllowedOrigins] },
    log: config.log,
    database: { url: redactUrl(config.database.url), poolMax: config.database.poolMax },
    redis: { url: redactUrl(config.redis.url) },
    session: {
      cookieName: config.session.cookieName,
      ttlSeconds: config.session.ttlSeconds,
      idleTimeoutSeconds: config.session.idleTimeoutSeconds,
      csrfCookieName: config.session.csrfCookieName,
      secret: '[redacted]',
    },
    storage: {
      endpoint: config.storage.endpoint,
      region: config.storage.region,
      bucketPublic: config.storage.bucketPublic,
      bucketPrivate: config.storage.bucketPrivate,
      forcePathStyle: config.storage.forcePathStyle,
      accessKeyId: '[redacted]',
      secretAccessKey: '[redacted]',
    },
    mail: config.mail,
    payments: { provider: config.payments.provider, webhookSecret: '[redacted]' },
    rateLimit: config.rateLimit,
    observability: config.observability,
  };
}

/** Strip userinfo from a URL (postgres://user:password@host → postgres://[redacted]@host). */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '[redacted]';
      parsed.password = '';
    }
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}
