import { describe, expect, it } from 'vitest';
import { ConfigValidationError, loadConfig, redactConfig, redactUrl } from '../src/index.js';

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:secret@localhost:5432/mercato',
  REDIS_URL: 'redis://localhost:6379/0',
  SESSION_SECRET: 'a'.repeat(48),
  PAYMENT_WEBHOOK_SECRET: 'b'.repeat(48),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin-secret',
  S3_BUCKET_PUBLIC: 'mercato-public',
  S3_BUCKET_PRIVATE: 'mercato-private',
};

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const config = loadConfig(validEnv);
    expect(config.env).toBe('test');
    expect(config.api.port).toBe(3000);
    expect(config.api.trustProxy).toBe(false);
    expect(config.session.ttlSeconds).toBe(604_800);
    expect(config.payments.provider).toBe('mock');
    expect(config.mail.transport).toBe('smtp');
  });

  it('fails fast on missing required variables, naming them without values', () => {
    const broken = { ...validEnv };
    delete broken['DATABASE_URL'];
    delete broken['SESSION_SECRET'];
    try {
      loadConfig(broken);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      const message = (error as ConfigValidationError).message;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('SESSION_SECRET');
    }
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({ ...validEnv, API_PORT: '70000' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...validEnv, API_PORT: 'abc' })).toThrow(ConfigValidationError);
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'http://not-postgres' })).toThrow(
      ConfigValidationError,
    );
    expect(() => loadConfig({ ...validEnv, SESSION_SECRET: 'too-short' })).toThrow(
      ConfigValidationError,
    );
    expect(() => loadConfig({ ...validEnv, NODE_ENV: 'staging' })).toThrow(ConfigValidationError);
  });

  it('parses boolean, list and number options', () => {
    const config = loadConfig({
      ...validEnv,
      API_TRUST_PROXY: 'true',
      LOG_PRETTY: '1',
      API_CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      DATABASE_POOL_MAX: '25',
    });
    expect(config.api.trustProxy).toBe(true);
    expect(config.log.pretty).toBe(true);
    expect(config.api.corsAllowedOrigins).toEqual(['https://a.example', 'https://b.example']);
    expect(config.database.poolMax).toBe(25);
    expect(config.database.migrationUrl).toBe(validEnv['DATABASE_URL']);
  });

  it('redacts secrets when logging configuration', () => {
    const config = loadConfig(validEnv);
    const redacted = redactConfig(config);
    const serialized = JSON.stringify(redacted);
    // Key names may legitimately contain the word "secret"; what must never
    // appear are the secret VALUES.
    expect(serialized).not.toContain('a'.repeat(48));
    expect(serialized).not.toContain('minioadmin-secret');
    expect(redacted['session']).toHaveProperty('secret', '[redacted]');
  });

  it('redacts credentials in URLs', () => {
    expect(redactUrl('postgres://user:pass@db:5432/mercato')).not.toContain('pass');
    expect(redactUrl('not a url')).toBe('[invalid-url]');
  });
});
