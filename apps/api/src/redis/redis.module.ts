import { Global, Inject, Injectable, Logger, Module, type Provider } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '@mercato/config';
import { APP_CONFIG, REDIS_CLIENT } from '../app.tokens.js';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Redis => {
    const client = new Redis(config.redis.url, {
      // Redis is never the source of truth for business state; keep failures
      // bounded and visible instead of retrying indefinitely.
      maxRetriesPerRequest: 2,
      connectTimeout: 3_000,
      commandTimeout: 3_000,
      // Commands issued while disconnected must fail fast (e.g. readiness
      // pings) instead of piling up in an unbounded offline queue.
      enableOfflineQueue: false,
      // Connection is established explicitly during module init so the first
      // readiness probe cannot race the TCP connect.
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 500, 5_000),
    });
    const logger = new Logger('Redis');
    client.on('error', (error: Error) => {
      logger.error(`redis error: ${error.message}`);
    });
    return client;
  },
};

@Injectable()
class RedisLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      // Boot continues when Redis is unavailable; readiness reports it as
      // down and the client keeps retrying with bounded backoff.
      new Logger('Redis').warn(
        `redis unavailable at startup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

/** Bounded ephemeral state: rate limits, queues, short-lived cache. */
@Global()
@Module({
  providers: [redisProvider, RedisLifecycle],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
