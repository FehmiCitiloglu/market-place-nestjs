import { Global, Inject, Injectable, Module, type Provider } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AppConfig } from '@mercato/config';
import { APP_CONFIG, PG_POOL, DRIZZLE } from '../app.tokens.js';

export type Db = NodePgDatabase<Record<string, never>>;

export function createDrizzle(pool: pg.Pool): Db {
  return drizzle(pool);
}

const poolProvider: Provider = {
  provide: PG_POOL,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): pg.Pool =>
    new pg.Pool({
      connectionString: config.database.url,
      max: config.database.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'mercato-api',
    }),
};

const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [PG_POOL],
  useFactory: (pool: pg.Pool): Db => createDrizzle(pool),
};

@Injectable()
class PoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

/** Owns the PostgreSQL connection pool (transactional source of truth). */
@Global()
@Module({
  providers: [poolProvider, drizzleProvider, PoolLifecycle],
  exports: [PG_POOL, DRIZZLE],
})
export class DbModule {}
