import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from '@mercato/config';
import { AppConfigModule } from './app-config.module.js';
import { APP_LOGGER } from '../app.tokens.js';
import { DbModule } from '../db/db.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { HealthModule } from '../modules/health/health.module.js';
import { DocsModule } from '../modules/docs/docs.module.js';
import { ProblemDetailsExceptionFilter } from '../common/http/problem-details.filter.js';

/**
 * Root module of the modular monolith. Business modules (identity, catalog,
 * inventory, checkout, ...) are added here as they land; each owns its
 * tables, services, controllers and policies.
 */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(config), DbModule, RedisModule, HealthModule, DocsModule],
      providers: [
        {
          // Satisfies the exception filter's logger injection; the real
          // structured logger is bound in bootstrap before use.
          provide: APP_LOGGER,
          useValue: console,
        },
        ProblemDetailsExceptionFilter,
      ],
    };
  }
}
