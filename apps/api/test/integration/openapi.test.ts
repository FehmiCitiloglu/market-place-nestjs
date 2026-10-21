import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestEnv } from '@mercato/testing';
import { loadConfig } from '@mercato/config';
import { createApp } from '../../src/app/bootstrap.js';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

describe('OpenAPI documentation', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const config = loadConfig(buildTestEnv());
    ({ app } = await createApp(config));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves an OpenAPI 3.1 document generated from the shared contracts', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(response.statusCode).toBe(200);
    const document = response.json<{ openapi: string; paths: Record<string, unknown> }>();
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/api/v1', '/health/live', '/health/ready', '/health/startup']),
    );
  });

  it('serves an offline Swagger UI', async () => {
    const docs = await app.inject({ method: 'GET', url: '/docs' });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');
    expect(docs.body).toContain('/docs-static/swagger-ui-bundle.js');
    expect(docs.body).toContain('/docs/swagger-init.js');

    const asset = await app.inject({ method: 'GET', url: '/docs-static/swagger-ui.css' });
    expect(asset.statusCode).toBe(200);

    const init = await app.inject({ method: 'GET', url: '/docs/swagger-init.js' });
    expect(init.statusCode).toBe(200);
    expect(init.headers['content-type']).toContain('application/javascript');
  });
});
