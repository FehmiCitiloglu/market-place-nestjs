/**
 * Shared integration-test environment.
 *
 * Integration tests run against real PostgreSQL and Redis started via
 * `docker compose up -d postgres redis` (see docker-compose.yml). Ports are
 * intentionally offset from the default 5432/6379 to avoid clashing with any
 * database the developer already runs locally.
 */
export interface TestInfraConfig {
  readonly databaseUrl: string;
  readonly migrationUrl: string;
  readonly redisUrl: string;
  readonly s3Endpoint: string;
}

export const TEST_INFRA_DEFAULTS: TestInfraConfig = {
  databaseUrl:
    process.env['TEST_DATABASE_URL'] ??
    'postgres://mercato:mercato-dev-only@127.0.0.1:55432/mercato_test',
  migrationUrl:
    process.env['TEST_DATABASE_MIGRATION_URL'] ??
    'postgres://mercato:mercato-dev-only@127.0.0.1:55432/mercato_test',
  redisUrl: process.env['TEST_REDIS_URL'] ?? 'redis://127.0.0.1:56379/1',
  s3Endpoint: process.env['TEST_S3_ENDPOINT'] ?? 'http://127.0.0.1:9000',
};

/** Deterministic, clearly-labeled development-only secrets for tests. */
export function buildTestEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    API_PORT: '3099',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_INFRA_DEFAULTS.databaseUrl,
    DATABASE_MIGRATION_URL: TEST_INFRA_DEFAULTS.migrationUrl,
    REDIS_URL: TEST_INFRA_DEFAULTS.redisUrl,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789',
    PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-0123456789abcdef012345',
    S3_ENDPOINT: TEST_INFRA_DEFAULTS.s3Endpoint,
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key-0123456789',
    S3_BUCKET_PUBLIC: 'mercato-public-test',
    S3_BUCKET_PRIVATE: 'mercato-private-test',
    RATE_LIMIT_ENABLED: 'false',
    ...overrides,
  };
}
