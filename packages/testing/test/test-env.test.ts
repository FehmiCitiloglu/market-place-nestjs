import { describe, expect, it } from 'vitest';
import { buildTestEnv, TEST_INFRA_DEFAULTS } from '../src/test-env.js';

describe('buildTestEnv', () => {
  it('produces a complete, clearly test-only environment', () => {
    const env = buildTestEnv();
    expect(env['NODE_ENV']).toBe('test');
    expect(env['SESSION_SECRET']).toContain('test');
    expect(env['PAYMENT_WEBHOOK_SECRET']).toContain('test');
    expect(env['DATABASE_URL']).toBe(TEST_INFRA_DEFAULTS.databaseUrl);
    expect(env['RATE_LIMIT_ENABLED']).toBe('false');
  });

  it('allows overrides for degraded-configuration tests', () => {
    const env = buildTestEnv({ REDIS_URL: 'redis://127.0.0.1:1/0' });
    expect(env['REDIS_URL']).toBe('redis://127.0.0.1:1/0');
    expect(env['DATABASE_URL']).toBe(TEST_INFRA_DEFAULTS.databaseUrl);
  });

  it('points at the offset docker-compose ports by default', () => {
    expect(TEST_INFRA_DEFAULTS.databaseUrl).toContain('55432');
    expect(TEST_INFRA_DEFAULTS.redisUrl).toContain('56379');
    expect(TEST_INFRA_DEFAULTS.s3Endpoint).toContain('9000');
  });
});
