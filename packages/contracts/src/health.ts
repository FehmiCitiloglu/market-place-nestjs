/// <reference types="zod-openapi" />
import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

export const livenessResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('mercato-api'),
    timestamp: isoDateTimeSchema,
  })
  .meta({ id: 'LivenessResponse' });

export const readinessCheckSchema = z.object({
  name: z.enum(['database', 'redis']),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().optional(),
});

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'unavailable']),
    checks: z.array(readinessCheckSchema),
    timestamp: isoDateTimeSchema,
  })
  .meta({ id: 'ReadinessResponse' });

export const serviceInfoSchema = z
  .object({
    name: z.literal('mercato-api'),
    version: z.string().meta({ example: '0.1.0' }),
    apiVersion: z.literal('v1'),
    environment: z.enum(['development', 'test', 'production']),
    timestamp: isoDateTimeSchema,
  })
  .meta({ id: 'ServiceInfo' });

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
export type ServiceInfo = z.infer<typeof serviceInfoSchema>;
