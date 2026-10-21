import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '@mercato/config';
import type { LivenessResponse, ReadinessResponse, ServiceInfo } from '@mercato/contracts';
import { APP_CONFIG } from '../../app.tokens.js';
import { readPackageVersion } from '../docs/package-version.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('api/v1')
  serviceInfo(): ServiceInfo {
    return {
      name: 'mercato-api',
      version: readPackageVersion(),
      apiVersion: 'v1',
      environment: this.config.env,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  liveness(): LivenessResponse {
    return this.health.liveness();
  }

  @Get('health/ready')
  async readiness(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResponse> {
    const readiness = await this.health.readiness();
    if (readiness.status !== 'ready') {
      void reply.status(503);
    }
    return readiness;
  }

  @Get('health/startup')
  async startup(@Res({ passthrough: true }) reply: FastifyReply): Promise<ReadinessResponse> {
    const startup = await this.health.startup();
    if (startup.status !== 'ready') {
      void reply.status(503);
    }
    return startup;
  }
}
