import { createDocument } from 'zod-openapi';
import { problemDetailsSchema } from './common.js';
import { livenessResponseSchema, readinessResponseSchema, serviceInfoSchema } from './health.js';

const problemResponse = (status: string, description: string) => ({
  [status]: {
    description,
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
});

/**
 * The OpenAPI 3.1 document is generated from the same zod schemas used for
 * runtime validation, so the contract cannot drift from implementation input
 * and output handling.
 */
export type OpenApiDocument = ReturnType<typeof createDocument>;

export function buildOpenApiDocument(options: {
  version: string;
  environment: string;
}): OpenApiDocument {
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Mercato API',
      version: options.version,
      description:
        'Production-oriented, security-first multi-vendor marketplace backend. ' +
        'All prices are integer minor units with an explicit currency. ' +
        'Authenticated endpoints use opaque server-side sessions (HttpOnly cookies) plus a CSRF token header.',
      license: { name: 'MIT' },
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
    tags: [{ name: 'Health', description: 'Liveness, readiness and service information' }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'mercato_session',
          description: 'Opaque server-side session token (HttpOnly, Secure, SameSite=Lax)',
        },
        csrfToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-csrf-token',
          description:
            'Double-submit CSRF token; required for cookie-authenticated state-changing requests',
        },
      },
    },
    paths: {
      '/api/v1': {
        get: {
          tags: ['Health'],
          operationId: 'getServiceInfo',
          summary: 'Service and API version information',
          responses: {
            '200': {
              description: 'Service information',
              content: { 'application/json': { schema: serviceInfoSchema } },
            },
            ...problemResponse('429', 'Rate limit exceeded'),
            ...problemResponse('500', 'Unexpected error'),
          },
        },
      },
      '/health/live': {
        get: {
          tags: ['Health'],
          operationId: 'getLiveness',
          summary: 'Liveness probe: the process is running',
          security: [],
          responses: {
            '200': {
              description: 'Process is alive',
              content: { 'application/json': { schema: livenessResponseSchema } },
            },
          },
        },
      },
      '/health/ready': {
        get: {
          tags: ['Health'],
          operationId: 'getReadiness',
          summary: 'Readiness probe: dependencies (PostgreSQL, Redis) are reachable',
          security: [],
          responses: {
            '200': {
              description: 'Service is ready to accept traffic',
              content: { 'application/json': { schema: readinessResponseSchema } },
            },
            '503': {
              description: 'One or more dependencies are unavailable',
              content: { 'application/json': { schema: readinessResponseSchema } },
            },
          },
        },
      },
      '/health/startup': {
        get: {
          tags: ['Health'],
          operationId: 'getStartup',
          summary: 'Startup probe: application initialization completed',
          security: [],
          responses: {
            '200': {
              description: 'Startup completed',
              content: { 'application/json': { schema: readinessResponseSchema } },
            },
            '503': {
              description: 'Startup incomplete',
              content: { 'application/json': { schema: readinessResponseSchema } },
            },
          },
        },
      },
    },
  });
}
