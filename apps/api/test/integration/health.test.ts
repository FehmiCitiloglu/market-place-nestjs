import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestEnv } from '@mercato/testing';
import { loadConfig } from '@mercato/config';
import { createApp } from '../../src/app/bootstrap.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

describe('health endpoints (real PostgreSQL + Redis)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const config = loadConfig(buildTestEnv());
    ({ app } = await createApp(config));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live reports the process is alive', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; service: string; timestamp: string }>();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('mercato-api');
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });

  it('GET /health/ready reports database and redis checks', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; checks: { name: string; status: string }[] }>();
    expect(body.status).toBe('ready');
    expect(body.checks.map((check) => `${check.name}:${check.status}`).sort()).toEqual([
      'database:up',
      'redis:up',
    ]);
  });

  it('GET /health/startup reports initialization state', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/startup' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe('ready');
  });

  it('returns 503 with per-check detail when a dependency is down', async () => {
    const config = loadConfig(
      buildTestEnv({
        REDIS_URL: 'redis://127.0.0.1:1/0',
        DATABASE_URL: 'postgres://127.0.0.1:1/mercato_test',
      }),
    );
    const { app: degraded } = await createApp(config);
    await degraded.init();
    try {
      const response = await degraded.inject({ method: 'GET', url: '/health/ready' });
      expect(response.statusCode).toBe(503);
      const body = response.json<{ status: string; checks: { name: string; status: string }[] }>();
      expect(body.status).toBe('unavailable');
      expect(body.checks.every((check) => check.status === 'down')).toBe(true);
    } finally {
      await degraded.close();
    }
  });
});
