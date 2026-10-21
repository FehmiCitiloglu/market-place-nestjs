import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import type { LivenessResponse, ReadinessResponse } from '@mercato/contracts';
import { PG_POOL, REDIS_CLIENT } from '../../app.tokens.js';

interface CheckOutcome {
  name: 'database' | 'redis';
  status: 'up' | 'down';
  latencyMs: number;
}

@Injectable()
export class HealthService {
  private initialized = false;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  markInitialized(): void {
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  liveness(): LivenessResponse {
    return { status: 'ok', service: 'mercato-api', timestamp: new Date().toISOString() };
  }

  async readiness(): Promise<ReadinessResponse> {
    const checks = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const allUp = checks.every((check) => check.status === 'up');
    return {
      status: allUp ? 'ready' : 'unavailable',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  async startup(): Promise<ReadinessResponse> {
    const readiness = await this.readiness();
    if (!this.initialized) {
      return { ...readiness, status: 'unavailable' };
    }
    return readiness;
  }

  private async checkDatabase(): Promise<CheckOutcome> {
    const startedAt = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { name: 'database', status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { name: 'database', status: 'down', latencyMs: Date.now() - startedAt };
    }
  }

  private async checkRedis(): Promise<CheckOutcome> {
    const startedAt = Date.now();
    try {
      await this.redis.ping();
      return { name: 'redis', status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { name: 'redis', status: 'down', latencyMs: Date.now() - startedAt };
    }
  }
}
