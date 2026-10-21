import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestEnv } from '@mercato/testing';
import { loadConfig } from '@mercato/config';
import { createApp } from '../../src/app/bootstrap.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

describe('HTTP hardening (real app instance)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const config = loadConfig(buildTestEnv());
    ({ app } = await createApp(config));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets conservative security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['content-security-policy']).toContain("object-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['server']).toBeUndefined();
  });

  it('echoes a valid x-request-id and generates one otherwise', async () => {
    const echoed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'req-abc-123' },
    });
    expect(echoed.headers['x-request-id']).toBe('req-abc-123');

    const generated = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'bad id with spaces' },
    });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-/);
  });

  it('answers unknown routes with Problem Details', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    const body = response.json<{ code: string; status: number; detail: string }>();
    expect(body.code).toBe('not_found');
    expect(body.status).toBe(404);
    expect(body.detail).toContain('/api/v1/nope');
  });

  it('rejects oversized request bodies with Problem Details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(response.statusCode).toBe(413);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json<{ code: string }>().code).toBe('payload_too_large');
  });

  it('rejects unsupported media types with Problem Details', async () => {
    // Fastify dispatches content-type parsing after route matching, and Phase 1
    // exposes no write endpoints yet, so an XML POST currently hits the
    // not-found handler (still Problem Details, stable error code). The 415
    // mapping (FST_ERR_CTP_INVALID_MEDIA_TYPE -> unsupported_media_type) is
    // verified in test/unit/problem-details.test.ts and is exercised end-to-end
    // against real write endpoints starting with Phase 2 (POST /auth/*).
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1',
      headers: { 'content-type': 'application/xml' },
      payload: '<xml/>',
    });
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json<{ code: string }>().code).toBe('not_found');
  });

  it('exposes service information without sensitive data', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ name: string; apiVersion: string; environment: string }>();
    expect(body.name).toBe('mercato-api');
    expect(body.apiVersion).toBe('v1');
    expect(body.environment).toBe('test');
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('applies rate limiting when enabled', async () => {
    const config = loadConfig(
      buildTestEnv({
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MAX: '2',
        RATE_LIMIT_WINDOW_SECONDS: '60',
      }),
    );
    const { app: limited } = await createApp(config);
    await limited.init();
    try {
      const first = await limited.inject({ method: 'GET', url: '/api/v1' });
      const second = await limited.inject({ method: 'GET', url: '/api/v1' });
      const third = await limited.inject({ method: 'GET', url: '/api/v1' });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(third.statusCode).toBe(429);
      expect(third.headers['retry-after']).toBeDefined();
      const body = third.json<{ code: string; status: number }>();
      expect(body.code).toBe('rate_limited');
      expect(body.status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
